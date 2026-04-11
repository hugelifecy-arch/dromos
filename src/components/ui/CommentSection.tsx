'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import type { FeedComment } from '@/types/database';

type CommentWithAuthor = FeedComment & {
  author?: { full_name: string; avatar_url: string | null };
};

interface CommentSectionProps {
  postId: string;
  commentsCount: number;
}

export default function CommentSection({ postId, commentsCount }: CommentSectionProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(commentsCount);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (open && !fetched) {
      loadComments();
    }
  }, [open]);

  async function loadComments() {
    const { data } = await supabase
      .from('feed_comments')
      .select(`
        *,
        author:profiles!author_id(full_name, avatar_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments((data as CommentWithAuthor[]) || []);
    setFetched(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || loading) return;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('feed_comments')
      .insert({ post_id: postId, author_id: user.id, content: newComment.trim() })
      .select(`*, author:profiles!author_id(full_name, avatar_url)`)
      .single();

    if (!error && data) {
      setComments((prev) => [...prev, data as CommentWithAuthor]);
      setCount((c) => c + 1);
      setNewComment('');

      // Update post comments_count
      await supabase
        .from('feed_posts')
        .update({ comments_count: count + 1 })
        .eq('id', postId);
    }
    setLoading(false);
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm hover:text-brand-400 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        {count > 0 && count}
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-surface-800">
          {/* Comments list */}
          {!fetched ? (
            <div className="py-3 text-center">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-surface-500 mb-3">No comments yet. Be the first!</p>
          ) : (
            <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <img
                    src={comment.author?.avatar_url || `${AVATAR_PLACEHOLDER}${comment.author?.full_name || 'U'}`}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover bg-surface-800 flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="bg-surface-800 rounded-xl px-3 py-2">
                      <span className="text-xs font-medium text-white">{comment.author?.full_name}</span>
                      <p className="text-sm text-surface-300 mt-0.5">{comment.content}</p>
                    </div>
                    <time className="text-[10px] text-surface-600 ml-3 mt-0.5 block">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!newComment.trim() || loading}
              className="p-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
