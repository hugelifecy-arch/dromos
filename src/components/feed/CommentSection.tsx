'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import Link from 'next/link';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: { full_name: string; avatar_url: string | null } | null;
  author_id: string;
}

interface CommentSectionProps {
  postId: string;
  initialCount: number;
}

export default function CommentSection({ postId, initialCount }: CommentSectionProps) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(initialCount);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expanded) return;
    loadComments();
  }, [expanded]);

  async function loadComments() {
    const { data } = await supabase
      .from('feed_comments')
      .select('id, content, created_at, author_id, author:profiles!author_id(full_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (data) {
      const normalized = data.map((c: any) => ({
        ...c,
        author: Array.isArray(c.author) ? c.author[0] : c.author,
      }));
      setComments(normalized);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('feed_comments')
      .insert({ post_id: postId, author_id: user.id, content: newComment.trim() })
      .select('id, content, created_at, author_id, author:profiles!author_id(full_name, avatar_url)')
      .single();

    if (data && !error) {
      const normalized = {
        ...data,
        author: Array.isArray((data as any).author) ? (data as any).author[0] : (data as any).author,
      } as Comment;
      setComments((prev) => [...prev, normalized]);
      setCount((c) => c + 1);
      setNewComment('');
    }
    setLoading(false);
  }

  if (!expanded) {
    return (
      <button
        onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-400 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {count > 0 && count}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-surface-800 pt-3">
      {/* Comments list */}
      <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-2">
            <Link href={`/app/driver/${comment.author_id}`}>
              <img
                src={comment.author?.avatar_url || `${AVATAR_PLACEHOLDER}${comment.author?.full_name || 'U'}`}
                alt=""
                className="w-7 h-7 rounded-full object-cover bg-surface-800 flex-shrink-0"
              />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="bg-surface-800 rounded-xl px-3 py-2">
                <Link href={`/app/driver/${comment.author_id}`} className="text-xs font-medium text-white hover:underline">
                  {comment.author?.full_name}
                </Link>
                <p className="text-sm text-surface-300">{comment.content}</p>
              </div>
              <time className="text-[10px] text-surface-500 ml-3">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </time>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-2">No comments yet</p>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 bg-surface-800 border border-surface-700 rounded-full px-4 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={!newComment.trim() || loading}
          className="p-2 text-brand-400 hover:text-brand-300 disabled:text-surface-600 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
