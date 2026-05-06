import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import './Chatbot.css';

// ── Helpers ────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtTime(str) {
  if (!str) return '';
  return str.slice(0, 5);
}

const isRtl = (t) => /[؀-ۿ]/.test(t);

// ── Default chips by page context ─────────────────────────────
function getDefaultChips(path, lang) {
  const ar = lang === 'ar';
  if (path.includes('/map')) {
    return ar
      ? ['ابحث عن غرفة', 'تنقل', 'جدولي اليوم', 'من أنت؟']
      : ['Find a room', 'Navigate', 'My schedule', 'Who are you?'];
  }
  if (path.includes('/schedule')) {
    return ar
      ? ['نسبة حضوري', 'وين القاعة؟', 'الإشعارات']
      : ['My attendance', 'Find classroom', 'My notifications'];
  }
  return ar
    ? ['جدولي اليوم', 'نسبة حضوري', 'ابحث عن غرفة', 'الإعلانات']
    : ['My schedule today', 'My attendance', 'Find a room', 'Announcements'];
}

// ── Rich card components ───────────────────────────────────────

function ScheduleCard({ item, onShowMap }) {
  return (
    <div className={`chat-card chat-card--schedule ${item.is_current ? 'chat-card--active' : ''}`}>
      <div className="chat-card-header">
        <span className="chat-card-code">{item.code}</span>
        {item.is_current && <span className="chat-card-live">Now</span>}
        <span className="chat-card-time">{fmtTime(item.start_time)} – {fmtTime(item.end_time)}</span>
      </div>
      <div className="chat-card-title">{item.course_name}</div>
      <div className="chat-card-meta">
        <span>📍 {item.room_number}</span>
        <span>👨‍🏫 {item.instructor}</span>
      </div>
      {item.room_id && (
        <button className="chat-card-btn" onClick={() => onShowMap(item)}>
          Show on Map
        </button>
      )}
    </div>
  );
}

function RoomCard({ item, onShowMap }) {
  return (
    <div className="chat-card chat-card--room">
      <div className="chat-card-header">
        <span className="chat-card-code">{item.room_number}</span>
        <span className="chat-card-type">{item.type?.replace(/_/g, ' ')}</span>
      </div>
      <div className="chat-card-title">{item.name}</div>
      <div className="chat-card-meta">
        <span>🏢 {item.building_name}</span>
        <span>🏬 {item.floor_label}</span>
        {item.capacity && <span>👥 {item.capacity} seats</span>}
      </div>
      {item.room_id && (
        <button className="chat-card-btn" onClick={() => onShowMap(item)}>
          Show on Map
        </button>
      )}
    </div>
  );
}

function AttendanceCard({ item }) {
  const pct = parseInt(item.percentage) || 0;
  const tier = pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  return (
    <div className={`chat-card chat-card--attendance chat-card--att-${tier}`}>
      <div className="att-card-info">
        <span className="att-card-code">{item.code}</span>
        <span className="att-card-pct">{pct}%</span>
      </div>
      <div className="att-card-name">{item.course_name}</div>
      <div className="att-card-bar">
        <div className="att-bar-track">
          <div className="att-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="att-bar-label">{item.present}/{item.total}</span>
      </div>
    </div>
  );
}

function NotificationCard({ item }) {
  return (
    <div className={`chat-card chat-card--notif ${!item.is_read ? 'chat-card--unread' : ''}`}>
      {!item.is_read && <div className="notif-unread-dot" />}
      <div className="chat-card-title notif-title">{item.title}</div>
      {item.body && (
        <div className="chat-card-meta notif-body">
          {item.body.length > 90 ? item.body.slice(0, 90) + '…' : item.body}
        </div>
      )}
      <div className="notif-time">{timeAgo(item.created_at)}</div>
    </div>
  );
}

function AnnouncementCard({ item }) {
  return (
    <div className="chat-card chat-card--announcement">
      {item.category && <span className="ann-cat">{item.category}</span>}
      <div className="chat-card-title">{item.title}</div>
      {item.body && (
        <div className="chat-card-meta notif-body">
          {item.body.length > 100 ? item.body.slice(0, 100) + '…' : item.body}
        </div>
      )}
      <div className="notif-time">{timeAgo(item.created_at)}</div>
    </div>
  );
}

function Cards({ cards, onShowMap }) {
  if (!cards?.items?.length) return null;
  return (
    <div className="chat-cards-wrap">
      {cards.type === 'schedule' && cards.items.map((item, i) => (
        <ScheduleCard key={i} item={item} onShowMap={onShowMap} />
      ))}
      {cards.type === 'rooms' && cards.items.map((item, i) => (
        <RoomCard key={i} item={item} onShowMap={onShowMap} />
      ))}
      {cards.type === 'attendance' && cards.items.map((item, i) => (
        <AttendanceCard key={i} item={item} />
      ))}
      {cards.type === 'notifications' && cards.items.map((item, i) => (
        <NotificationCard key={i} item={item} />
      ))}
      {cards.type === 'announcements' && cards.items.map((item, i) => (
        <AnnouncementCard key={i} item={item} />
      ))}
    </div>
  );
}

// ── Text formatter (bold + line breaks) ───────────────────────
function Fmt({ text }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => (
        <span key={i}>
          {line.split(/(\*\*[^*]+\*\*)/).map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j}>{p.slice(2, -2)}</strong>
              : p
          )}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────
const INITIAL_MSG = {
  id: 1, role: 'bot',
  text: 'أهلاً! 👋 أنا مساعد النجاح الذكي.\nاكتب بالعربي أو الإنجليزي، أو اضغط 🎤 للتحدث.\n\nHello! I\'m Najah Smart Assistant.\nType in Arabic or English, or press 🎤 to speak.',
  timestamp: new Date(),
};

export default function Chatbot() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();

  const [open,        setOpen]        = useState(false);
  const [messages,    setMessages]    = useState([INITIAL_MSG]);
  const [history,     setHistory]     = useState([]);
  const [input,       setInput]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [listening,   setListening]   = useState(false);
  const [lang,        setLang]        = useState('ar');
  const [chips,       setChips]       = useState(() => getDefaultChips(location.pathname, 'ar'));

  const bodyRef   = useRef(null);
  const inputRef  = useRef(null);
  const recRef    = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 160);
  }, [open]);

  // Update chips when page changes
  useEffect(() => {
    setChips(getDefaultChips(location.pathname, lang));
  }, [location.pathname]);

  // Personalize greeting once user loads
  useEffect(() => {
    if (user?.first_name) {
      setMessages(prev => {
        if (prev[0]?.id !== 1) return prev;
        const greeting = lang === 'ar'
          ? `أهلاً ${user.first_name}! 👋 أنا مساعد النجاح الذكي.\nاكتب بالعربي أو الإنجليزي، أو اضغط 🎤 للتحدث.`
          : `Hello ${user.first_name}! 👋 I'm Najah Smart Assistant.\nType in Arabic or English, or press 🎤 to speak.`;
        return [{ ...prev[0], text: greeting }, ...prev.slice(1)];
      });
    }
  }, [user]);

  // ── Send message ───────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const arabicMsg = isRtl(msg);
    const newLang = arabicMsg ? 'ar' : 'en';
    setLang(newLang);

    setMessages(prev => [...prev, {
      id: Date.now(), role: 'user', text: msg, timestamp: new Date(),
    }]);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: 'thinking', role: 'bot', text: '', isThinking: true, timestamp: new Date(),
      }]);
      setLoading(true);
    }, 280);

    try {
      const { data } = await axiosInstance.post('/chat', {
        message: msg,
        history: history.slice(-6),
        user_context: user
          ? { name: user.first_name, student_id: user.student_id, role: user.role }
          : null,
      });

      const reply = data.data;

      setHistory(prev => [
        ...prev,
        { role: 'user',  text: msg          },
        { role: 'model', text: reply.message },
      ]);

      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        {
          id:        Date.now() + 1,
          role:      'bot',
          text:      reply.message,
          cards:     reply.cards     || null,
          action:    reply.action    || null,
          followUp:  reply.follow_up || null,
          timestamp: new Date(),
        },
      ]);

      if (reply.follow_up?.length) setChips(reply.follow_up);
      else setChips(getDefaultChips(location.pathname, newLang));

    } catch {
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        {
          id: Date.now() + 1, role: 'bot', isError: true, timestamp: new Date(),
          text: arabicMsg
            ? 'عذراً، حدث خطأ. تأكد أن السيرفر يعمل.'
            : 'Sorry, an error occurred. Make sure the backend is running.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history, user, location.pathname]);

  // ── Voice input ────────────────────────────────────────────
  const toggleVoice = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice recognition requires Chrome browser.'); return; }
    const rec = new SR();
    rec.lang        = lang === 'ar' ? 'ar-PS' : 'en-US';
    rec.continuous  = false;
    rec.interimResults = false;
    rec.onstart  = () => setListening(true);
    rec.onresult = e  => { setInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror  = () => setListening(false);
    rec.onend    = () => setListening(false);
    recRef.current = rec;
    rec.start();
  };

  // ── TTS ────────────────────────────────────────────────────
  const speak = (text, msgLang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*•]/g, '').replace(/\n/g, '. ');
    const u     = new SpeechSynthesisUtterance(clean);
    u.lang      = msgLang === 'ar' ? 'ar-SA' : 'en-US';
    u.rate      = 0.9;
    const voice = window.speechSynthesis.getVoices()
      .find(v => v.lang.startsWith(msgLang === 'ar' ? 'ar' : 'en'));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };

  // ── Map navigation action ──────────────────────────────────
  const handleAction = (action) => {
    if (!action) return;
    if (action.type === 'show_room' || action.type === 'open_map') {
      navigate('/map', { state: { roomId: action.room_id, floorId: action.floor_id } });
      setOpen(false);
    }
    if (action.type === 'show_schedule') { navigate('/schedule'); setOpen(false); }
  };

  const handleShowMap = (item) => {
    if (item.room_id || item.floor_id) {
      navigate('/map', { state: { roomId: item.room_id, floorId: item.floor_id } });
      setOpen(false);
    }
  };

  // ── Input auto-resize ──────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([INITIAL_MSG]);
    setHistory([]);
    setChips(getDefaultChips(location.pathname, lang));
  };

  const unread = messages.filter(m => m.role === 'bot' && m.id !== 1).length;

  return (
    <>
      {/* ── Toggle Button ──────────────────────────────────── */}
      <button
        id="chatbot-toggler"
        className={open ? 'open' : ''}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle chatbot"
      >
        <span className="toggler-icon">
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="16" y1="4" x2="4" y2="16"  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <line x1="8" y1="9"  x2="16" y2="9"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </span>
        {!open && unread > 0 && (
          <span className="chatbot-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {/* ── Chat Popup ─────────────────────────────────────── */}
      <div className={`chatbot-popup ${open ? 'open' : ''}`}>

        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="chat-avatar">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L2 8l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M2 16l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h2 className="chat-name">مساعد النجاح</h2>
              <p className="chat-status">
                <span className="status-dot" />
                Najah Smart Assistant
              </p>
            </div>
          </div>
          <div className="chat-header-right">
            <button
              className="chat-hdr-btn"
              onClick={() => setLang(l => {
                const nl = l === 'ar' ? 'en' : 'ar';
                setChips(getDefaultChips(location.pathname, nl));
                return nl;
              })}
              title="Switch language"
            >
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            <button className="chat-hdr-btn chat-hdr-btn--ghost" onClick={clearChat} title="Clear chat">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="chat-hdr-btn chat-hdr-btn--ghost" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="13" y1="3" x2="3" y2="13"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="chat-body" ref={bodyRef}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`message ${msg.role === 'bot' ? 'bot-msg' : 'user-msg'} ${msg.isError ? 'msg-error' : ''}`}
              dir={isRtl(msg.text) ? 'rtl' : 'ltr'}
            >
              {msg.role === 'bot' && (
                <div className="bot-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3L2 8l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              <div className="msg-body">
                {/* Text bubble */}
                {msg.isThinking ? (
                  <div className="thinking-dots">
                    <span/><span/><span/>
                  </div>
                ) : (
                  <div className="msg-bubble">
                    <p className="msg-text"><Fmt text={msg.text} /></p>
                  </div>
                )}

                {/* Rich cards */}
                {msg.cards && !msg.isThinking && (
                  <Cards cards={msg.cards} onShowMap={handleShowMap} />
                )}

                {/* Action buttons */}
                {!msg.isThinking && msg.action && (
                  <div className="msg-actions">
                    {(msg.action.type === 'show_room' || msg.action.type === 'open_map') && (
                      <button className="msg-action-btn" onClick={() => handleAction(msg.action)}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M5 8.5a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 8.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {isRtl(msg.text) ? 'عرض على الخريطة' : 'Show on Map'}
                      </button>
                    )}
                    {msg.action.type === 'show_schedule' && (
                      <button className="msg-action-btn" onClick={() => handleAction(msg.action)}>
                        📅 {isRtl(msg.text) ? 'عرض الجدول' : 'View Schedule'}
                      </button>
                    )}
                  </div>
                )}

                {/* TTS + timestamp */}
                {msg.role === 'bot' && !msg.isThinking && (
                  <div className="msg-meta">
                    <button
                      className="tts-btn"
                      onClick={() => speak(msg.text, isRtl(msg.text) ? 'ar' : 'en')}
                      title="Listen"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M3 5.5H1v5h2l4 3v-11L3 5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M13.5 3.5a6 6 0 0 1 0 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span className="msg-time">
                      {msg.timestamp instanceof Date
                        ? msg.timestamp.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick chips */}
        {chips.length > 0 && (
          <div className="chat-chips" dir="auto">
            {chips.map((chip, i) => (
              <button
                key={i}
                className="chip"
                onClick={() => sendMessage(chip)}
                disabled={loading}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="chat-footer">
          <div className={`chat-form ${loading ? 'loading' : ''}`}>
            <button
              className={`voice-btn ${listening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title={lang === 'ar' ? 'تحدث' : 'Speak'}
            >
              {listening ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="2"  y="4" width="3" height="8" rx="1"/>
                  <rect x="6.5" y="2" width="3" height="12" rx="1"/>
                  <rect x="11" y="5" width="3" height="6" rx="1"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 8a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="8" y1="14" x2="8" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>

            <textarea
              ref={inputRef}
              className="msg-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder={lang === 'ar' ? 'اكتب رسالتك...' : 'Type your message...'}
              rows={1}
              disabled={loading}
              dir={isRtl(input) ? 'rtl' : 'ltr'}
            />

            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L2 7.5 7.5 9M14 2L9 14 7.5 9M14 2L7.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {listening && (
            <div className="listening-bar">
              <span/><span/><span/>
              <p>{lang === 'ar' ? 'جاري الاستماع...' : 'Listening...'}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
