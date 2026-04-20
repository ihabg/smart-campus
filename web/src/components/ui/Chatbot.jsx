import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import './Chatbot.css';

// University context — adapts Gemini to campus assistant
const INITIAL_MESSAGE = {
  id: 1, role: 'bot',
  text: 'أهلاً! 👋 أنا مساعد النجاح الذكي.\nاكتب بالعربي أو الإنجليزي، أو اضغط 🎤 للتحدث.\n\nHello! I\'m Najah Smart Assistant.\nType in Arabic or English, or press 🎤 to speak.',
  timestamp: new Date(),
};

export default function Chatbot() {
  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState([INITIAL_MESSAGE]);
  const [chatHistory, setChatHistory] = useState([]); // for Gemini context
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [listening, setListening] = useState(false);
  const [lang,      setLang]      = useState('ar');

  const chatBodyRef    = useRef(null);
  const inputRef       = useRef(null);
  const recognitionRef = useRef(null);
  const navigate       = useNavigate();

  // Auto scroll
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // ── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');

    const isArabic = /[\u0600-\u06FF]/.test(msg);
    setLang(isArabic ? 'ar' : 'en');

    // Add user message to UI
    const userMsg = { id: Date.now(), role: 'user', text: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    // Show thinking placeholder
    setTimeout(() => {
      setMessages(prev => [...prev, { id: 'thinking', role: 'bot', text: 'Thinking...', isThinking: true, timestamp: new Date() }]);
      setLoading(true);
    }, 300);

    try {
      const { data } = await axiosInstance.post('/chat', {
        message: msg,
        history: chatHistory.slice(-6), // Send last 6 messages for context
      });

      const reply = data.data;

      // Update chat history for Gemini context
      setChatHistory(prev => [
        ...prev,
        { role: 'user',  text: msg },
        { role: 'model', text: reply.message },
      ]);

      // Remove thinking + add real response
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        { id: Date.now()+1, role: 'bot', text: reply.message, action: reply.action, timestamp: new Date() },
      ]);
    } catch {
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        { id: Date.now()+1, role: 'bot', text: isArabic ? 'عذراً، حدث خطأ. تأكد أن السيرفر يعمل.' : 'Sorry, an error occurred. Make sure the backend is running.', isError: true, timestamp: new Date() },
      ]);
    } finally { setLoading(false); }
  }, [input, loading, chatHistory]);

  // ── Voice input ───────────────────────────────────────────────
  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice not supported. Use Chrome browser.'); return; }
    const rec = new SR();
    rec.lang = lang === 'ar' ? 'ar-PS' : 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart  = () => setListening(true);
    rec.onresult = e => { setInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror  = () => setListening(false);
    rec.onend    = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  // ── Text to speech ────────────────────────────────────────────
  const speak = (text, msgLang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*•]/g,'').replace(/\n/g,'. ');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang  = msgLang === 'ar' ? 'ar-SA' : 'en-US';
    u.rate  = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const voice  = voices.find(v => v.lang.startsWith(msgLang === 'ar' ? 'ar' : 'en'));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  };

  // ── Action buttons ────────────────────────────────────────────
  const handleAction = (action) => {
    if (!action) return;
    if (action.type === 'show_room' || action.type === 'open_map') {
      navigate('/map', { state: { roomId: action.room_id, floorId: action.floor_id } });
      setOpen(false);
    }
    if (action.type === 'show_schedule') { navigate('/schedule'); setOpen(false); }
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  // ── Format text (bold) ────────────────────────────────────────
  const fmt = (text) =>
    text.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line.split(/(\*\*[^*]+\*\*)/).map((p,j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2,-2)}</strong> : p
        )}
        {i < arr.length-1 && <br />}
      </span>
    ));

  const unread = messages.filter(m => m.role === 'bot' && m.id !== 1).length;

  return (
    <>
      {/* Toggle button */}
      <button id="chatbot-toggler" className={open ? 'open' : ''} onClick={() => setOpen(o => !o)} aria-label="Open chatbot">
        <span className="material-icon">{open ? '✕' : '💬'}</span>
        {!open && unread > 0 && <span className="chatbot-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {/* Chatbot popup */}
      <div className={`chatbot-popup ${open ? 'open' : ''}`}>

        {/* Header */}
        <div className="chat-header">
          <div className="header-info">
            <div className="header-icon">🎓</div>
            <div>
              <h2 className="logo-text">مساعد النجاح</h2>
              <p className="logo-sub">Najah Smart Assistant • Online</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="lang-btn" onClick={() => setLang(l => l==='ar'?'en':'ar')} title="Switch language">
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="chat-body" ref={chatBodyRef}>
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`message ${msg.role === 'bot' ? 'bot-message' : 'user-message'} ${msg.isError ? 'error' : ''}`}
              dir={/[\u0600-\u06FF]/.test(msg.text) ? 'rtl' : 'ltr'}
            >
              {msg.role === 'bot' && <div className="bot-icon">🎓</div>}
              <div className="message-content">
                {msg.isThinking ? (
                  <div className="thinking-dots"><span/><span/><span/></div>
                ) : (
                  <p className="message-text">{fmt(msg.text)}</p>
                )}

                {/* Action buttons */}
                {msg.action?.type === 'show_room' && (
                  <button className="action-btn" onClick={() => handleAction(msg.action)}>
                    🗺️ {/[\u0600-\u06FF]/.test(msg.text) ? 'عرض على الخريطة' : 'Show on Map'}
                  </button>
                )}
                {msg.action?.type === 'open_map' && (
                  <button className="action-btn" onClick={() => handleAction(msg.action)}>
                    🗺️ {/[\u0600-\u06FF]/.test(msg.text) ? 'فتح الخريطة' : 'Open Map'}
                  </button>
                )}
                {msg.action?.type === 'show_schedule' && (
                  <button className="action-btn" onClick={() => handleAction(msg.action)}>
                    📅 {/[\u0600-\u06FF]/.test(msg.text) ? 'عرض الجدول' : 'View Schedule'}
                  </button>
                )}

                {/* TTS button for bot messages */}
                {msg.role === 'bot' && !msg.isThinking && (
                  <button
                    className="tts-btn"
                    onClick={() => speak(msg.text, /[\u0600-\u06FF]/.test(msg.text) ? 'ar' : 'en')}
                    title="Listen"
                  >🔊</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="chat-footer">
          <div className="chat-form">
            <button
              className={`voice-btn ${listening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title={lang === 'ar' ? 'تحدث' : 'Speak'}
            >
              {listening ? '⏹' : '🎤'}
            </button>
            <textarea
              ref={inputRef}
              className="message-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={lang === 'ar' ? 'اكتب رسالتك...' : 'Type your message...'}
              rows={1}
              disabled={loading}
              dir={/[\u0600-\u06FF]/.test(input) ? 'rtl' : 'ltr'}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              title="Send"
            >
              ➤
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
