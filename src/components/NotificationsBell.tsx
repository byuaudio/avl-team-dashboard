import { useEffect, useState } from 'react'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/api'
import type { AppNotification } from '../lib/types'

/** Bell with unread count and a dropdown of recent notifications. */
export function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)

  function load() {
    fetchNotifications().then(setItems).catch(() => undefined)
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  const unread = items.filter((n) => !n.read).length

  return (
    <div className="bell-wrap">
      <button
        className="bell-button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) load()
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-menu card">
            <div className="bell-menu-head">
              <strong>Notifications</strong>
              {unread > 0 && (
                <button
                  className="chip-button"
                  onClick={() => markAllNotificationsRead().then(load)}
                >
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 && <p className="muted">Nothing yet.</p>}
            {items.map((n) => (
              <a
                key={n.id}
                href={n.link ?? '#/'}
                className={`bell-item${n.read ? '' : ' bell-item-unread'}`}
                onClick={() => {
                  if (!n.read) markNotificationRead(n.id).then(load)
                  setOpen(false)
                }}
              >
                <span>{n.body}</span>
                <span className="muted bell-time">
                  {new Date(n.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
