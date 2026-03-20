'use client';

import { Bot, User } from 'lucide-react';

interface Message {
  id: string;
  session_id: string;
  psid: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string | null;
  metadata?: any;
  created_at: string;
}

interface AiLogDetailProps {
  messages: Message[];
}

const INTENT_STYLES: Record<string, string> = {
  order: 'bg-emerald-100 text-emerald-700',
  browse: 'bg-blue-100 text-blue-700',
  info: 'bg-stone-100 text-stone-600',
  faq: 'bg-amber-100 text-amber-700',
  greeting: 'bg-violet-100 text-violet-700',
  error: 'bg-red-100 text-red-700',
};

function getIntentStyle(intent: string): string {
  const key = intent.toLowerCase();
  for (const [k, v] of Object.entries(INTENT_STYLES)) {
    if (key.includes(k)) return v;
  }
  return 'bg-stone-100 text-stone-600';
}

function truncateContent(content: string, maxLength: number = 500): string {
  if (!content) return '';
  // If content looks like JSON, try to pretty-truncate it
  if (content.startsWith('{') || content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content);
      const pretty = JSON.stringify(parsed, null, 2);
      if (pretty.length > maxLength) {
        return pretty.slice(0, maxLength) + '...';
      }
      return pretty;
    } catch {
      // Not valid JSON, treat as plain text
    }
  }
  if (content.length > maxLength) {
    return content.slice(0, maxLength) + '...';
  }
  return content;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AiLogDetail({ messages }: AiLogDetailProps) {
  if (!messages || messages.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-nunito text-stone-400">No messages in this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-4 px-2">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isSystem = msg.role === 'system';

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center">
              <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 max-w-md">
                <p className="text-xs font-nunito text-stone-400 text-center">
                  {truncateContent(msg.content, 200)}
                </p>
                <p className="text-[10px] font-nunito text-stone-300 text-center mt-1">
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[75%] ${
                isUser ? 'order-2' : 'order-1'
              }`}
            >
              {/* Role label */}
              <div
                className={`flex items-center gap-1.5 mb-1 ${
                  isUser ? 'justify-start' : 'justify-end'
                }`}
              >
                {isUser ? (
                  <User className="h-3 w-3 text-stone-400" />
                ) : (
                  <Bot className="h-3 w-3 text-[#3D8A80]" />
                )}
                <span className="text-[11px] font-nunito font-medium text-stone-400">
                  {isUser ? 'Customer' : 'AI Assistant'}
                </span>
                {msg.intent && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-nunito font-semibold ${getIntentStyle(
                      msg.intent
                    )}`}
                  >
                    {msg.intent}
                  </span>
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`rounded-lg p-3 ${
                  isUser
                    ? 'bg-stone-100 text-stone-800'
                    : 'bg-[#E0F7F4] text-stone-800'
                }`}
              >
                <p className="text-sm font-nunito whitespace-pre-wrap break-words leading-relaxed">
                  {truncateContent(msg.content)}
                </p>
              </div>

              {/* Timestamp */}
              <p
                className={`text-[10px] font-nunito text-stone-300 mt-1 ${
                  isUser ? 'text-left' : 'text-right'
                }`}
              >
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
