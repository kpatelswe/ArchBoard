import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from pycrdt import Doc, Map

from app.analysis.graph import BoardGraph
from app.analysis.rules import deep_sync_chain
from app.models.membership import BoardRole
from app.realtime import rate_limit, unsaved
from app.realtime.manager import BoardConnection, ConnectionManager
from app.realtime.state import BoardState, BoardStateRegistry
from app.schemas.snapshot import BoardSnapshot
from app.websocket import routes


def state_with_node():
    doc = Doc()
    doc.get('nodes', type=Map)['n'] = Map({
        'id': 'n', 'type': 'architecture', 'position': {'x': 0, 'y': 0},
        'data': {'kind': 'service', 'label': 'old', 'metadata': {'technology': 'Go'}},
    })
    return BoardState(uuid.uuid4(), doc, 0)


def mock_session(monkeypatch):
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr('app.realtime.state.SessionLocal', lambda: session)
    return session


async def test_flush_failure_retries_on_release(monkeypatch):
    mock_session(monkeypatch)
    save = AsyncMock(side_effect=[OSError('offline'), SimpleNamespace(version=1)])
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    state = state_with_node()
    state._dirty = True
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    with pytest.raises(OSError, match='offline'):
        await state.flush()
    assert state._dirty
    await registry.release(state.board_id, lambda: 0)
    assert save.await_count == 2
    assert not state._dirty
    assert registry.peek(state.board_id) is None


async def test_failed_release_retains_state(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', AsyncMock(side_effect=OSError))
    state = state_with_node()
    state._dirty = True
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    with pytest.raises(OSError):
        await registry.release(state.board_id, lambda: 0)
    assert registry.peek(state.board_id) is state
    assert state._dirty
    registry._retries[state.board_id][1].cancel()


async def test_idle_retry_persists_after_recovery(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.FLUSH_SECONDS', 0.01)
    save = AsyncMock(side_effect=[OSError, OSError, SimpleNamespace(version=1)])
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    state = state_with_node()
    state._dirty = True
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    with pytest.raises(OSError):
        await registry.release(state.board_id, lambda: 0)
    await asyncio.wait_for(registry._retries[state.board_id][1], 1)
    await asyncio.sleep(0)
    assert state.board_id not in registry._retries
    assert save.await_count == 3
    assert not state._dirty
    assert registry.peek(state.board_id) is None


async def test_idle_retry_hands_back_to_rejoined_session(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.FLUSH_SECONDS', 0.01)
    save = AsyncMock(side_effect=OSError)
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    state = state_with_node()
    state._dirty = True
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    count = 0
    with pytest.raises(OSError):
        await registry.release(state.board_id, lambda: count)
    first = registry._retries[state.board_id][1]
    count = 1
    assert await registry.acquire(state.board_id) is state
    await asyncio.wait_for(first, 1)
    await asyncio.sleep(0)
    assert save.await_count == 1
    assert state.board_id not in registry._retries
    count = 0
    save.side_effect = None
    save.return_value = SimpleNamespace(version=1)
    await registry.release(state.board_id, lambda: count)
    assert registry.peek(state.board_id) is None


async def test_replacement_replica_gets_its_own_retry(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.FLUSH_SECONDS', 0.05)
    save = AsyncMock(side_effect=[OSError, SimpleNamespace(version=1), OSError, SimpleNamespace(version=2)])
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    old = state_with_node()
    old._dirty = True
    registry = BoardStateRegistry()
    registry._states[old.board_id] = old
    with pytest.raises(OSError):
        await registry.release(old.board_id, lambda: 0)
    stale = registry._retries[old.board_id][1]
    await registry.release(old.board_id, lambda: 0)  # rejoin, edit, leave: saved and evicted
    assert registry.peek(old.board_id) is None
    await asyncio.sleep(0)
    assert stale.cancelled() and old.board_id not in registry._retries
    replacement = BoardState(old.board_id, old.doc, 1)
    replacement._dirty = True
    registry._states[old.board_id] = replacement
    with pytest.raises(OSError):
        await registry.release(old.board_id, lambda: 0)
    owner, task = registry._retries[old.board_id]
    assert owner is replacement
    await asyncio.wait_for(task, 1)
    assert save.await_count == 4
    assert not replacement._dirty
    assert registry.peek(old.board_id) is None


async def test_idle_retry_yields_to_rest_save(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.FLUSH_SECONDS', 0.01)
    save = AsyncMock(side_effect=[OSError, None])
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(
        return_value=SimpleNamespace(version=5, ydoc_state=None)))
    state = state_with_node()
    state._dirty = True
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    with pytest.raises(OSError):
        await registry.release(state.board_id, lambda: 0)
    await asyncio.wait_for(registry._retries[state.board_id][1], 1)
    await asyncio.sleep(0)
    assert state.board_id not in registry._retries
    assert save.await_count == 2
    assert registry.peek(state.board_id) is None


async def test_live_flush_still_merges_over_conflicts(monkeypatch):
    mock_session(monkeypatch)
    save = AsyncMock(side_effect=[None, SimpleNamespace(version=6)])
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(
        return_value=SimpleNamespace(version=5, ydoc_state=None)))
    state = state_with_node()
    state._dirty = True
    await state.flush()
    assert save.await_count == 2
    assert state.version == 6 and not state._superseded


async def test_release_rechecks_connections_after_waiting():
    state = state_with_node()
    registry = BoardStateRegistry()
    registry._states[state.board_id] = state
    count = 0
    async with registry._load_lock:
        releasing = asyncio.create_task(registry.release(state.board_id, lambda: count))
        await asyncio.sleep(0)
        count = 1
    await releasing
    assert registry.peek(state.board_id) is state
    count = 0
    await registry.release(state.board_id, lambda: count)
    assert registry.peek(state.board_id) is None


async def test_clean_flush_does_not_open_session(monkeypatch):
    factory = MagicMock(side_effect=AssertionError('unexpected session'))
    monkeypatch.setattr('app.realtime.state.SessionLocal', factory)
    await BoardState(uuid.uuid4(), Doc(), 0).flush()
    factory.assert_not_called()


async def test_cancelled_flush_is_dirty(monkeypatch):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', AsyncMock(side_effect=asyncio.CancelledError))
    state = state_with_node()
    state._dirty = True
    with pytest.raises(asyncio.CancelledError):
        await state.flush()
    assert state._dirty


def test_materialize_legacy_and_field_edits():
    state = state_with_node()
    assert state.to_snapshot()['nodes'][0]['data']['label'] == 'old'
    node = state.doc.get('nodes', type=Map)['n']
    node['data:label'] = 'new'
    node['data:technology'] = 'FastAPI'
    snapshot = BoardSnapshot.model_validate(state.to_snapshot())
    assert snapshot.nodes[0].data.label == 'new'
    assert snapshot.nodes[0].data.metadata['technology'] == 'FastAPI'
    restored = Doc()
    restored.apply_update(state.encoded_state())
    assert BoardState(state.board_id, restored, 0).to_snapshot() == state.to_snapshot()
    node['data:technology'] = None
    assert state.to_snapshot()['nodes'][0]['data']['metadata'] == {}
    assert BoardState(uuid.uuid4(), Doc(), 0).to_snapshot() == {'nodes': [], 'edges': []}


@pytest.mark.parametrize('metadata', [None, 42, 'invalid', ['invalid'], {}])
async def test_malformed_metadata_does_not_block_persistence(monkeypatch, metadata):
    mock_session(monkeypatch)
    save = AsyncMock(return_value=SimpleNamespace(version=1))
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    state = state_with_node()
    node = state.doc.get('nodes', type=Map)['n']
    node['data'] = {'kind': 'service', 'label': 'old', 'metadata': metadata}
    node['data:technology'] = 'Go'
    state._dirty = True
    await state.flush()
    snapshot = BoardSnapshot.model_validate(save.call_args.kwargs['snapshot'])
    assert snapshot.nodes[0].data.metadata == {'technology': 'Go'}
    assert not state._dirty


@pytest.mark.parametrize('remaining_same_user', [True, False])
async def test_presence_only_leaves_on_last_connection(monkeypatch, remaining_same_user):
    manager = ConnectionManager()
    board, user = uuid.uuid4(), uuid.uuid4()
    first = BoardConnection(None, 'first', user, BoardRole.EDITOR)
    other = BoardConnection(None, 'other', user if remaining_same_user else uuid.uuid4(), BoardRole.EDITOR)
    manager.add(board, first)
    manager.add(board, other)
    monkeypatch.setattr(routes, 'manager', manager)
    monkeypatch.setattr(routes.registry, 'release', AsyncMock())
    clear, publish = AsyncMock(), AsyncMock()
    monkeypatch.setattr(routes.presence, 'clear', clear)
    monkeypatch.setattr(routes, '_publish', publish)
    await routes._teardown(board, first)
    assert clear.called is not remaining_same_user
    assert publish.called is not remaining_same_user
    await routes._teardown(board, other)
    clear.assert_awaited_with(board, other.user_id)
    assert publish.call_args.args[1]['type'] == 'board.left'


def graph_for(pairs, *, asynchronous=()):
    ids = sorted({node for pair in pairs for node in pair})
    return BoardGraph.from_snapshot(BoardSnapshot.model_validate({
        'nodes': [{'id': node, 'type': 'architecture', 'position': {'x': 0, 'y': 0},
                   'data': {'kind': 'service', 'label': node}} for node in ids],
        'edges': [{'id': a + b, 'source': a, 'target': b,
                   'data': {'synchronous': (a, b) not in asynchronous}} for a, b in pairs],
    }))


@pytest.mark.parametrize('pairs,nodes,edges', [
    ([('A', 'B'), ('B', 'C'), ('C', 'A'), ('A', 'C'), ('X', 'A'), ('C', 'Y')],
     ['A', 'B', 'C'], ['AB', 'AC', 'BC', 'CA']),
    ([('A', 'A')], ['A'], ['AA']),
    ([('A', 'B'), ('B', 'A'), ('C', 'D'), ('D', 'C'), ('B', 'C')],
     ['A', 'B', 'C', 'D'], ['AB', 'BA', 'CD', 'DC']),
])
def test_all_cycle_members_and_edges(pairs, nodes, edges):
    finding, = deep_sync_chain(graph_for(pairs))
    assert finding.node_ids == nodes
    assert finding.edge_ids == edges


def test_acyclic_empty_and_async_graphs():
    assert deep_sync_chain(graph_for([])) == []
    assert deep_sync_chain(graph_for([('A', 'B')])) == []
    assert deep_sync_chain(graph_for([('A', 'B'), ('B', 'A')], asynchronous=[('B', 'A')])) == []


async def test_rate_budgets_are_independent(monkeypatch):
    counts = {}
    async def incr(key):
        counts[key] = counts.get(key, 0) + 1
        return counts[key]
    redis = SimpleNamespace(incr=incr, expire=AsyncMock())
    monkeypatch.setattr(rate_limit, 'get_redis', lambda: redis)
    monkeypatch.setattr(rate_limit.time, 'time', lambda: 100)
    board, user = uuid.uuid4(), uuid.uuid4()
    for _ in range(500):
        awareness = await rate_limit.register_event(user, board)
        updates = await rate_limit.register_event(user, board, document=True)
        assert rate_limit.verdict(updates, document=True) == 'allow'
    assert rate_limit.verdict(awareness) == 'drop'
    assert rate_limit.verdict(0, document=True) == 'allow'
    assert rate_limit.verdict(rate_limit.MAX_UPDATES_PER_WINDOW + 1, document=True) == 'disconnect'
    assert rate_limit.verdict(2001) == 'disconnect'
    assert len(counts) == 2


@pytest.mark.parametrize('oversized', [False, True])
async def test_rejected_document_closes_socket(monkeypatch, oversized):
    board, user_id = uuid.uuid4(), uuid.uuid4()
    user = SimpleNamespace(id=user_id, name='Test', avatar_url=None)
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(routes, 'SessionLocal', lambda: session)
    monkeypatch.setattr(routes, 'verify_session_token', lambda token: 'clerk_user')
    monkeypatch.setattr(routes.user_repository, 'get_by_clerk_id', AsyncMock(return_value=user))
    monkeypatch.setattr(routes.membership_repository, 'get_role', AsyncMock(return_value=BoardRole.EDITOR))
    monkeypatch.setattr(routes.presence, 'mark', AsyncMock())
    monkeypatch.setattr(routes.presence, 'roster', AsyncMock(return_value=[]))
    monkeypatch.setattr(routes.registry, 'acquire', AsyncMock(return_value=state_with_node()))
    monkeypatch.setattr(routes, 'manager', ConnectionManager())
    monkeypatch.setattr(routes.bus, 'subscribe', AsyncMock())
    monkeypatch.setattr(routes, '_publish', AsyncMock())
    monkeypatch.setattr(routes, '_teardown', AsyncMock())
    monkeypatch.setattr(routes.rate_limit, 'register_event', AsyncMock(return_value=rate_limit.MAX_UPDATES_PER_WINDOW + 1))
    socket = SimpleNamespace(
        query_params={'token': 'test', 'protocol': routes.CLIENT_PROTOCOL}, accept=AsyncMock(), send_json=AsyncMock(), close=AsyncMock(),
        receive=AsyncMock(return_value={'type': 'websocket.receive', 'bytes': b'x' * (routes.MAX_FRAME_BYTES + 1 if oversized else 1)}),
    )
    await routes.board_websocket(socket, board)
    assert socket.close.call_args.args[0] == (4400 if oversized else routes.CLOSE_RATE_LIMITED)


@pytest.mark.parametrize('params', [{'token': 'test'}, {'token': 'test', 'protocol': '1'}])
async def test_outdated_client_is_refused(monkeypatch, params):
    verify = MagicMock()
    monkeypatch.setattr(routes, 'verify_session_token', verify)
    socket = SimpleNamespace(query_params=params, accept=AsyncMock(), close=AsyncMock())
    await routes.board_websocket(socket, uuid.uuid4())
    socket.close.assert_awaited_once_with(routes.CLOSE_FORBIDDEN, routes.OUTDATED_CLIENT_REASON)
    verify.assert_not_called()


def stored_board(version, doc=None, snapshot=None):
    return SimpleNamespace(
        version=version,
        ydoc_state=doc.get_update() if doc is not None else None,
        current_snapshot=snapshot or {'nodes': [], 'edges': []},
    )


def node_snapshot(label):
    return {'nodes': [{'id': 'n', 'type': 'architecture', 'position': {'x': 0, 'y': 0},
                       'data': {'kind': 'service', 'label': label}}], 'edges': []}


def label_of(snapshot, node_id='n'):
    return next(node['data']['label'] for node in snapshot['nodes'] if node['id'] == node_id)


async def strand_unsaved_rename(monkeypatch, base_doc):
    """A replica renames a node, its last client leaves during a DB outage,
    and the worker dies before the in-memory retry can save it."""
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=stored_board(0, base_doc)))
    registry = BoardStateRegistry()
    state = await registry.acquire(uuid.uuid4())
    state.doc.get('nodes', type=Map)['n']['data:label'] = 'stranded'
    state._dirty = True
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', AsyncMock(side_effect=OSError('db down')))
    with pytest.raises(OSError):
        await registry.release(state.board_id, lambda: 0)
    registry._retries[state.board_id][1].cancel()  # worker restart
    return state.board_id


def seeded_doc(label):
    doc = Doc()
    doc.get('nodes', type=Map)['n'] = Map(node_snapshot(label)['nodes'][0])
    return doc


async def test_stranded_edit_survives_worker_restart(monkeypatch, fake_redis):
    mock_session(monkeypatch)
    base = seeded_doc('old')
    board_id = await strand_unsaved_rename(monkeypatch, base)
    assert fake_redis.data
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=stored_board(0, base)))
    save = AsyncMock(return_value=SimpleNamespace(version=1))
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    restarted = BoardStateRegistry()
    await restarted.recover_unsaved()
    save.assert_awaited_once()
    assert save.call_args.kwargs['board_id'] == board_id
    assert save.call_args.kwargs['expected_version'] == 0
    assert label_of(save.call_args.kwargs['snapshot']) == 'stranded'
    assert not fake_redis.data
    assert restarted.peek(board_id) is None


async def test_stranded_edit_merges_into_newer_live_save(monkeypatch, fake_redis):
    mock_session(monkeypatch)
    base = seeded_doc('old')
    board_id = await strand_unsaved_rename(monkeypatch, base)
    newer = Doc()
    newer.apply_update(base.get_update())
    newer.get('nodes', type=Map)['m'] = Map({**node_snapshot('added elsewhere')['nodes'][0], 'id': 'm'})
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=stored_board(3, newer)))
    save = AsyncMock(return_value=SimpleNamespace(version=4))
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    restarted = BoardStateRegistry()
    state = await restarted.acquire(board_id)
    state._flush_task.cancel()
    await state.flush()
    snapshot = save.call_args.kwargs['snapshot']
    assert save.call_args.kwargs['expected_version'] == 3
    assert label_of(snapshot) == 'stranded' and label_of(snapshot, 'm') == 'added elsewhere'
    assert not fake_redis.data


@pytest.mark.parametrize('reseeded', [False, True])
async def test_stranded_edit_never_overwrites_newer_rest_save(monkeypatch, fake_redis, reseeded):
    mock_session(monkeypatch)
    base = seeded_doc('old')
    await strand_unsaved_rename(monkeypatch, base)
    rest = node_snapshot('rest')
    # A REST save replaced the board; maybe a live session has since re-seeded and saved it.
    newer = stored_board(2, seeded_doc('rest'), rest) if reseeded else stored_board(1, None, rest)
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=newer))
    save = AsyncMock(return_value=SimpleNamespace(version=newer.version + 1))
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    await BoardStateRegistry().recover_unsaved()
    save.assert_not_awaited()
    assert not fake_redis.data


async def test_independent_seeds_merge_stranded_edit(monkeypatch, fake_redis):
    """Two workers seed the same JSON snapshot; one saves while the other's edit is stranded."""
    mock_session(monkeypatch)
    board_id = uuid.uuid4()
    monkeypatch.setattr('app.realtime.state.board_repository.get',
                        AsyncMock(return_value=stored_board(0, None, node_snapshot('old'))))
    stranded = BoardStateRegistry()
    state = await stranded.acquire(board_id)
    state.doc.get('nodes', type=Map)['a'] = Map({**node_snapshot('stranded')['nodes'][0], 'id': 'a'})
    state._dirty = True
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', AsyncMock(side_effect=OSError('db down')))
    with pytest.raises(OSError):
        await stranded.release(board_id, lambda: 0)
    stranded._retries[board_id][1].cancel()  # worker restart

    other = await BoardState.load(board_id)
    other.doc.get('nodes', type=Map)['b'] = Map({**node_snapshot('saved elsewhere')['nodes'][0], 'id': 'b'})
    monkeypatch.setattr('app.realtime.state.board_repository.get',
                        AsyncMock(return_value=stored_board(1, other.doc, node_snapshot('old'))))
    save = AsyncMock(return_value=SimpleNamespace(version=2))
    monkeypatch.setattr('app.realtime.state.board_repository.update_snapshot', save)
    await BoardStateRegistry().recover_unsaved()
    save.assert_awaited_once()
    snapshot = save.call_args.kwargs['snapshot']
    assert save.call_args.kwargs['expected_version'] == 1
    assert label_of(snapshot, 'a') == 'stranded' and label_of(snapshot, 'b') == 'saved elsewhere'
    assert not fake_redis.data


async def test_stale_board_read_keeps_newer_journal_entry(monkeypatch, fake_redis):
    mock_session(monkeypatch)
    board_id = uuid.uuid4()
    base = seeded_doc('old')
    await unsaved.stash(unsaved.key_for(board_id, 'x'), base_version=5, base_state=base.get_state(),
                        base_lineage=None, update=base.get_update())
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=stored_board(4, None)))
    state = await BoardState.load(board_id)
    assert not state._dirty
    assert fake_redis.data


async def test_restash_uses_fresh_journal_key(monkeypatch, fake_redis):
    mock_session(monkeypatch)
    monkeypatch.setattr('app.realtime.state.board_repository.get', AsyncMock(return_value=stored_board(0, seeded_doc('old'))))
    state = await BoardState.load(uuid.uuid4())
    state._dirty = True
    await state.stash_unsaved()
    first = set(fake_redis.data)
    await unsaved.discard(*first)  # a recovering worker clears what it read
    await state.stash_unsaved()
    assert fake_redis.data and not set(fake_redis.data) & first
