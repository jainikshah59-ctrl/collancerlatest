/* Shared Instagram media viewer — fullscreen lightbox.
 * Videos play with controls; images show fullscreen.
 * Shows likes/comments/caption + link to the Instagram post.
 * Used by brand-side CreatorProfile and creator-side ProfilePageH.
 */
import React, { useEffect } from 'react';
import { X, Heart, MessageCircle, Eye, ExternalLink } from 'lucide-react';
import { compact } from '../lib/format.js';

export default function MediaViewer({ media, onClose }) {
  useEffect(() => {
    if (!media) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [media, onClose]);

  if (!media) return null;
  const isVideo = media.type === 'VIDEO' || media.type === 'REELS';
  const ins = media.insights || {};

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,.92)',
        display: 'flex', flexDirection: 'column',
        animation: 'cl-fade-in .18s ease',
      }}
      role="dialog" aria-modal="true" aria-label="Media viewer"
    >
      {/* top bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', gap: 14, fontSize: 13, fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Heart style={{ width: 15, height: 15 }} /> {compact(media.likes || 0)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MessageCircle style={{ width: 15, height: 15 }} /> {compact(media.comments || 0)}
          </span>
          {(media.views > 0 || ins.views > 0) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Eye style={{ width: 15, height: 15 }} /> {compact(ins.views || media.views || 0)}
            </span>
          )}
        </div>
        <button
          onClick={onClose} aria-label="Close viewer"
          style={{
            background: 'rgba(255,255,255,.12)', border: 0, borderRadius: '50%',
            width: 38, height: 38, display: 'grid', placeItems: 'center',
            cursor: 'pointer', color: '#fff',
          }}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* media */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1, minHeight: 0, display: 'grid', placeItems: 'center',
          padding: '0 12px',
        }}
      >
        {isVideo ? (
          <video
            src={media.url} controls autoPlay playsInline preload="auto"
            poster={media.thumbnail || undefined}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, background: '#000' }}
          />
        ) : (
          <img
            src={media.url || media.thumbnail} alt={media.caption || 'Instagram post'}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, objectFit: 'contain' }}
          />
        )}
      </div>

      {/* caption + link */}
      <div onClick={(e) => e.stopPropagation()} style={{ padding: '12px 16px 20px', color: '#fff' }}>
        {media.caption && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,.85)', marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {media.caption}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {ins.reach > 0 && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
              Reach {compact(ins.reach)} · {compact(ins.likes || 0)} likes
            </span>
          )}
          {media.permalink && (
            <a href={media.permalink} target="_blank" rel="noreferrer"
               style={{ fontSize: 13, fontWeight: 600, color: 'var(--cyan)',
                 display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              Open on Instagram <ExternalLink style={{ width: 14, height: 14 }} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
