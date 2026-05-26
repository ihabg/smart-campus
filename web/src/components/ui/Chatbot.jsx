import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import './Chatbot.css';

function fmtTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function dateTimeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function timeAgo(value) {
  if (!value) return '';
  const diff = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function stripForSpeech(text = '') {
  return String(text)
    .replace(/[*_`>#•]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '. ')
    .trim();
}


function normalizeSpokenRoomText(value = '') {
  let text = String(value || '').trim();
  if (!text) return text;

  const original = text;
  const lower = text
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const roomCode = getRoomCodeFromSpeech(lower);
  if (!roomCode) {
    return original;
  }

  // Keep short room-only voice commands clean in the chat bubble.
  if (/^(rome|room|find|show|open|where is|where's|take me to|go to)?\s*(g|gee|b|bee|basement|ground|room|rome|[0-9])/i.test(lower)) {
    return `Where is room ${roomCode}?`;
  }

  return original.replace(/\b(rome|room)\b/i, 'room');
}

function getRoomCodeFromSpeech(value = '') {
  const text = String(value || '')
    .toLowerCase()
    .replace(/\brome\b/g, 'room')
    .replace(/\bgee\b/g, 'g')
    .replace(/\bbee\b/g, 'b')
    .replace(/\boh\b|\bo\b/g, 'zero')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const direct = text.match(/\b([gb])\s*0*([0-9]{3,4})\b/i);
  if (direct) {
    const prefix = direct[1].toUpperCase();
    let digits = direct[2];
    if (prefix === 'G' && digits.length === 3) digits = `0${digits}`;
    if (prefix === 'B' && digits.length === 3) digits = `0${digits}`;
    return `${prefix}${digits}`;
  }

  const prefixMatch = text.match(/\b(?:room\s+)?([gb])\s+(.+)$/i);
  if (!prefixMatch) return null;

  const prefix = prefixMatch[1].toUpperCase();
  const tail = prefixMatch[2]
    .replace(/\bnumber\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (prefix === 'G' && isSpoken180(tail)) return 'G0180';

  if (prefix === 'B') {
    const bFloor = tail.match(/^(one|two|1|2)\s+(.+)$/i);
    if (bFloor && isSpoken180(bFloor[2])) {
      return `B${wordDigit(bFloor[1])}180`;
    }
  }

  const digits = wordsToDigits(tail);
  if (!digits) return null;

  if (prefix === 'G') {
    return `G${digits.length === 3 ? `0${digits}` : digits}`;
  }

  if (prefix === 'B') {
    return `B${digits.length === 3 ? `0${digits}` : digits}`;
  }

  return null;
}

function wordDigit(token = '') {
  const map = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9'
  };
  return map[String(token).toLowerCase()] || '';
}

function wordsToDigits(value = '') {
  const map = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', oh: '0', o: '0'
  };

  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .map((part) => map[part] ?? (part.match(/^\d+$/) ? part : ''))
    .join('')
    .slice(0, 5);
}

function isSpoken180(value = '') {
  const text = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return /^(180|0180|one eighty|one eight zero|one zero eight zero|zero one eighty|zero one eight zero|eighteen zero|one hundred eighty)$/.test(text);
}

function FormattedText({ text }) {
  return (
    <>
      {String(text || '').split('\n').map((line, i, arr) => (
        <span key={i}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : <React.Fragment key={j}>{part}</React.Fragment>
          ))}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function AssistantIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 12l9 4.5 9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3 16.5 12 21l9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 5 10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ScheduleCard({ item, onRoomOpen }) {
  const hasRoom = Boolean(item.room_id || item.room_number);
  return (
    <article className={`chat-card chat-card--schedule ${item.is_current ? 'chat-card--active' : ''}`}>
      <div className="chat-card-topline">
        <span className="chat-card-code">{item.code}</span>
        {item.is_current && <span className="chat-card-pill live">Now</span>}
        <span className="chat-card-time">{fmtTime(item.start_time)} – {fmtTime(item.end_time)}</span>
      </div>
      <h4 className="chat-card-title">{item.course_name}</h4>
      <div className="chat-card-meta-row">
        <span>📍 {item.room_number || 'TBA'}</span>
        {item.instructor && <span>👨‍🏫 {item.instructor}</span>}
      </div>
      {hasRoom && (
        <button type="button" className="chat-card-action" onClick={() => onRoomOpen(item)}>
          Open room <OpenIcon />
        </button>
      )}
    </article>
  );
}

function RoomCard({ item, onRoomOpen }) {
  return (
    <button type="button" className="chat-card chat-card--room chat-card--clickable" onClick={() => onRoomOpen(item)}>
      <div className="chat-card-topline">
        <span className="chat-card-code">{item.room_number}</span>
        {item.type && <span className="chat-card-pill">{String(item.type).replace(/_/g, ' ')}</span>}
      </div>
      <h4 className="chat-card-title">{item.name || 'Room'}</h4>
      <div className="chat-card-meta-row">
        {item.building_name && <span>🏢 {item.building_name}</span>}
        {item.floor_label && <span>🏬 {item.floor_label}</span>}
        {item.capacity ? <span>👥 {item.capacity} seats</span> : null}
      </div>
      <span className="chat-card-action chat-card-action--inline">
        Open this room <OpenIcon />
      </span>
    </button>
  );
}

function AttendanceCard({ item }) {
  const pct = Number(item.percentage || 0);
  const tier = pct >= 75 ? 'good' : pct >= 60 ? 'warn' : 'bad';
  return (
    <article className={`chat-card chat-card--attendance chat-card--${tier}`}>
      <div className="chat-card-topline">
        <span className="chat-card-code">{item.code}</span>
        <span className="chat-card-pill">{pct}%</span>
      </div>
      <h4 className="chat-card-title">{item.course_name}</h4>
      <div className="chat-progress"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <div className="chat-card-meta-row"><span>{item.present}/{item.total} attended</span></div>
    </article>
  );
}

function AssessmentCard({ item, onOpen }) {
  const isQuiz = item.assessment_type === 'quiz';
  return (
    <button type="button" className="chat-card chat-card--assessment chat-card--clickable" onClick={() => onOpen(item)}>
      <div className="chat-card-topline">
        <span className="chat-card-code">{isQuiz ? 'Quiz' : 'Assignment'}</span>
        <span className={`chat-card-pill ${String(item.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{item.status || 'Available'}</span>
      </div>
      <h4 className="chat-card-title">{item.title}</h4>
      <div className="chat-card-meta-row">
        <span>{item.course_code} §{item.section_number}</span>
        <span>Due {dateTimeLabel(item.closes_at)}</span>
        {item.points ? <span>{Number(item.points)} pts</span> : null}
      </div>
      <span className="chat-card-action chat-card-action--inline">
        Open {isQuiz ? 'quiz' : 'assignment'} <OpenIcon />
      </span>
    </button>
  );
}

function NotificationCard({ item }) {
  return (
    <article className={`chat-card chat-card--notification ${!item.is_read ? 'chat-card--unread' : ''}`}>
      <h4 className="chat-card-title">{item.title}</h4>
      {item.body && <p className="chat-card-desc">{String(item.body).slice(0, 120)}</p>}
      <div className="chat-card-meta-row"><span>{timeAgo(item.created_at)}</span></div>
    </article>
  );
}

function AnnouncementCard({ item }) {
  return (
    <article className="chat-card chat-card--announcement">
      <h4 className="chat-card-title">{item.title}</h4>
      {item.body && <p className="chat-card-desc">{String(item.body).slice(0, 120)}</p>}
      <div className="chat-card-meta-row"><span>{timeAgo(item.created_at || item.published_at)}</span></div>
    </article>
  );
}

function Cards({ cards, onRoomOpen, onAssessmentOpen }) {
  if (!cards?.items?.length) return null;
  return (
    <div className="chat-cards-wrap">
      {cards.type === 'schedule' && cards.items.map((item, index) => (
        <ScheduleCard key={`${item.section_id || item.code}-${index}`} item={item} onRoomOpen={onRoomOpen} />
      ))}
      {cards.type === 'rooms' && cards.items.map((item, index) => (
        <RoomCard key={`${item.room_id || item.id || item.room_number}-${index}`} item={item} onRoomOpen={onRoomOpen} />
      ))}
      {cards.type === 'attendance' && cards.items.map((item, index) => (
        <AttendanceCard key={`${item.code}-${index}`} item={item} />
      ))}
      {cards.type === 'assessments' && cards.items.map((item, index) => (
        <AssessmentCard key={`${item.id}-${index}`} item={item} onOpen={onAssessmentOpen} />
      ))}
      {cards.type === 'notifications' && cards.items.map((item, index) => (
        <NotificationCard key={`${item.id}-${index}`} item={item} />
      ))}
      {cards.type === 'announcements' && cards.items.map((item, index) => (
        <AnnouncementCard key={`${item.id}-${index}`} item={item} />
      ))}
    </div>
  );
}

function initialMessage(user) {
  const name = user?.first_name ? `, ${user.first_name}` : '';
  return {
    id: 1,
    role: 'bot',
    text: `Hello${name}! I’m Najah Assistant. Ask me about your schedule, quizzes, assignments, attendance, or any campus room.`,
    timestamp: new Date()
  };
}

export default function Chatbot() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [initialMessage(user)]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);
  const voicesLoadedRef = useRef(false);

  const unread = useMemo(
    () => messages.filter((msg) => msg.role === 'bot' && msg.id !== 1).length,
    [messages]
  );

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.id !== 1) return prev;
      return [initialMessage(user)];
    });
  }, [user]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 120);
  }, [open, location.pathname]);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
      voicesLoadedRef.current = true;
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const pickFemaleVoice = useCallback(() => {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang || ''));
    if (!voices.length) return null;

    const preferredNames = [
      'Jenny',
      'Aria',
      'Samantha',
      'Zira',
      'Susan',
      'Hazel',
      'Google US English',
      'Google UK English Female',
      'Microsoft Aria',
      'Microsoft Jenny',
      'Microsoft Zira'
    ];

    return voices.find((voice) => preferredNames.some((name) => voice.name?.toLowerCase().includes(name.toLowerCase())))
      || voices.find((voice) => /female|woman|jenny|aria|samantha|zira|susan|hazel/i.test(voice.name || ''))
      || voices.find((voice) => /en-US/i.test(voice.lang))
      || voices[0];
  }, []);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    const clean = stripForSpeech(text);
    if (!clean) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 0.82;
    utterance.pitch = 1.08;
    utterance.volume = 0.95;

    const run = () => {
      const voice = pickFemaleVoice();
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
    };

    if (!voicesLoadedRef.current) {
      window.setTimeout(run, 150);
    } else {
      run();
    }
  }, [pickFemaleVoice]);

  const openRoomOnMap = useCallback((item) => {
    const roomNumber = item.room_number || item.roomNumber || item.room || item.office;
    const roomId = item.room_id || item.id || item.dbId;
    const floorId = item.floor_id;

    if (!roomNumber && !roomId) {
      navigate('/map');
      setOpen(false);
      return;
    }

    // From the chatbot, go to the map and select/highlight the room only.
    // Do not add open=1, because that opens the full room details popup.
    const query = roomNumber
      ? `?room=${encodeURIComponent(roomNumber)}`
      : `?roomId=${encodeURIComponent(roomId)}`;

    navigate(`/map${query}`, {
      state: {
        roomId,
        roomNumber,
        floorId,
        openRoom: false,
        fromChatbot: true
      }
    });
    setOpen(false);
  }, [navigate]);

  const openAssessment = useCallback((item) => {
    navigate('/assessments', {
      state: {
        assessmentId: item.id,
        assessmentType: item.assessment_type,
        fromChatbot: true
      }
    });
    setOpen(false);
  }, [navigate]);

  const handleAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'show_room' || action.type === 'open_map') {
      openRoomOnMap(action);
    } else if (action.type === 'show_schedule') {
      navigate('/schedule');
      setOpen(false);
    } else if (action.type === 'show_assessments') {
      navigate('/assessments');
      setOpen(false);
    }
  }, [navigate, openRoomOnMap]);

  const sendMessage = useCallback(async (value) => {
    const rawText = String(value ?? input).trim();
    const text = normalizeSpokenRoomText(rawText);
    if (!text || loading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      text,
      timestamp: new Date()
    };
    const thinkingMessage = {
      id: `thinking-${Date.now()}`,
      role: 'bot',
      text: '',
      isThinking: true,
      timestamp: new Date()
    };

    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);

    try {
      const response = await axiosInstance.post('/chat', {
        message: text,
        history: history.slice(-8),
        user_context: user
          ? { name: user.first_name, student_id: user.student_id, role: user.role }
          : null
      });

      const reply = response.data?.data || {};
      const botText = reply.message || 'I could not prepare an answer right now.';
      const botMessage = {
        id: Date.now() + 1,
        role: 'bot',
        text: botText,
        cards: reply.cards || null,
        action: reply.action || null,
        timestamp: new Date()
      };

      setHistory((prev) => [
        ...prev,
        { role: 'user', text },
        { role: 'model', text: botText }
      ].slice(-12));

      setMessages((prev) => [
        ...prev.filter((msg) => !String(msg.id).startsWith('thinking-')),
        botMessage
      ]);

      window.setTimeout(() => speak(botText), 220);
    } catch (error) {
      console.error('Chatbot error:', error);
      const fallback = 'Sorry, I could not reach the Smart Campus server. Please make sure the backend is running and try again.';
      setMessages((prev) => [
        ...prev.filter((msg) => !String(msg.id).startsWith('thinking-')),
        {
          id: Date.now() + 1,
          role: 'bot',
          text: fallback,
          isError: true,
          timestamp: new Date()
        }
      ]);
      window.setTimeout(() => speak(fallback), 220);
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [history, input, loading, speak, user]);

  const toggleVoice = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg = 'Voice input works best in Google Chrome.';
      setMessages((prev) => [...prev, { id: Date.now(), role: 'bot', text: msg, isError: true, timestamp: new Date() }]);
      speak(msg);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      const msg = 'I could not hear you clearly. Please try again.';
      setMessages((prev) => [...prev, { id: Date.now(), role: 'bot', text: msg, isError: true, timestamp: new Date() }]);
      speak(msg);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      setListening(false);
      if (transcript) sendMessage(transcript);
    };

    recRef.current = recognition;
    recognition.start();
  }, [listening, sendMessage, speak]);

  const handleInputChange = (event) => {
    setInput(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 90)}px`;
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    window.speechSynthesis?.cancel();
    setHistory([]);
    setMessages([initialMessage(user)]);
  };

  return (
    <>
      <button
        id="chatbot-toggler"
        className={open ? 'open' : ''}
        onClick={() => setOpen((current) => !current)}
        aria-label="Toggle Najah Assistant"
      >
        <span className="toggler-icon">
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4l12 12M16 4 4 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 3H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M7 9h10M7 13h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </span>
        {!open && unread > 0 && <span className="chatbot-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      <section className={`chatbot-popup ${open ? 'open' : ''}`} aria-label="Najah Assistant">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-avatar"><AssistantIcon size={22} /></div>
            <div>
              <h2 className="chat-name">Najah Assistant</h2>
              <p className="chat-status"><span className="status-dot" /> Smart Campus database assistant</p>
            </div>
          </div>
          <div className="chat-header-right">
            <button className="chat-hdr-btn chat-hdr-btn--ghost" onClick={clearChat} title="Clear chat" aria-label="Clear chat">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="chat-hdr-btn chat-hdr-btn--ghost" onClick={() => setOpen(false)} title="Close" aria-label="Close assistant">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <main className="chat-body" ref={bodyRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role === 'bot' ? 'bot-msg' : 'user-msg'} ${msg.isError ? 'msg-error' : ''}`}>
              {msg.role === 'bot' && <div className="bot-avatar"><AssistantIcon size={15} /></div>}
              <div className="msg-body">
                {msg.isThinking ? (
                  <div className="thinking-dots"><span /><span /><span /></div>
                ) : (
                  <div className="msg-bubble"><p className="msg-text"><FormattedText text={msg.text} /></p></div>
                )}

                {!msg.isThinking && msg.cards && (
                  <Cards cards={msg.cards} onRoomOpen={openRoomOnMap} onAssessmentOpen={openAssessment} />
                )}

                {!msg.isThinking && msg.action && (
                  <div className="msg-actions">
                    {(msg.action.type === 'show_room' || msg.action.type === 'open_map') && (
                      <button className="msg-action-btn" onClick={() => handleAction(msg.action)}>
                        Open on Campus Map <OpenIcon />
                      </button>
                    )}
                    {msg.action.type === 'show_schedule' && (
                      <button className="msg-action-btn" onClick={() => handleAction(msg.action)}>Open Schedule <OpenIcon /></button>
                    )}
                    {msg.action.type === 'show_assessments' && (
                      <button className="msg-action-btn" onClick={() => handleAction(msg.action)}>Open Assignments & Quizzes <OpenIcon /></button>
                    )}
                  </div>
                )}

                {msg.role === 'bot' && !msg.isThinking && (
                  <div className="msg-meta"><span className="msg-time">{timeLabel(msg.timestamp)}</span></div>
                )}
              </div>
            </div>
          ))}
        </main>

        <footer className="chat-footer">
          <div className={`chat-form ${loading ? 'loading' : ''}`}>
            <button
              type="button"
              className={`voice-btn ${listening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title="Speak"
              aria-label="Speak to Najah Assistant"
            >
              {listening ? (
                <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <rect x="2" y="5" width="3" height="6" rx="1" />
                  <rect x="6.5" y="2" width="3" height="12" rx="1" />
                  <rect x="11" y="4" width="3" height="8" rx="1" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 10.5a2.5 2.5 0 0 0 2.5-2.5V4A2.5 2.5 0 0 0 5.5 4v4A2.5 2.5 0 0 0 8 10.5Z" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V15M6 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your schedule, quizzes, attendance, or a room..."
              rows={1}
              disabled={loading}
            />
            <button
              type="button"
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M17.5 2.5 8.5 11.5M17.5 2.5l-5 15-4-6-6-4 15-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </footer>
      </section>
    </>
  );
}
