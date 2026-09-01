import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { acceptInvite } from '../lib/api'

export function InvitePage() {
  const { inviteToken } = useParams<{ inviteToken: string }>()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    getToken()
      .then((token) => acceptInvite(token, inviteToken))
      .then((board) => !cancelled && navigate(`/boards/${board.id}`))
      .catch(() => !cancelled && setError('This invite is invalid, expired, or revoked.'))
    return () => {
      cancelled = true
    }
  }, [inviteToken, getToken, navigate])

  if (error) return <p className="status status--unreachable">{error}</p>
  return <p className="status status--checking">Joining board…</p>
}
