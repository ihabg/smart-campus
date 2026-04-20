import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';
import api from '../api/index';
import { COLORS, SPACING, RADIUS } from '../theme';

const QUICK_QUESTIONS = [
  '📍 Where is room 161?',
  '📅 My classes today',
  '🔍 Find computer labs',
  '❓ What can you do?',
];

export default function ChatScreen() {
  const [messages, setMessages] = useState([
    {
      id:   '0',
      role: 'bot',
      text: "Hi! 👋 I'm your Smart Campus Assistant.\n\nAsk me about:\n• 📍 Room locations\n• 📅 Your schedule\n• 👨‍🏫 Instructors\n• 🔍 Facilities",
      timestamp: new Date(),
    }
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const listRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setShowQuick(false);

    const userMsg = {
      id:        String(Date.now()),
      role:      'user',
      text:      msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data } = await api.post('/chat', { message: msg });
      const reply    = data.data;

      setMessages(prev => [...prev, {
        id:        String(Date.now() + 1),
        role:      'bot',
        text:      reply.message,
        action:    reply.action,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id:        String(Date.now() + 1),
        role:      'bot',
        text:      'Sorry, I could not process that. Make sure you are connected.',
        isError:   true,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const renderMessage = ({ item }) => {
    const isBot  = item.role === 'bot';
    const time   = item.timestamp.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[s.msgRow, isBot ? s.msgRowBot : s.msgRowUser]}>
        {isBot && (
          <View style={s.avatar}>
            <Text style={{ fontSize: 14 }}>🎓</Text>
          </View>
        )}
        <View style={[s.bubble, isBot ? s.bubbleBot : s.bubbleUser, item.isError && s.bubbleError]}>
          <Text style={[s.bubbleText, !isBot && { color: '#fff' }]}>{item.text}</Text>
          {item.action?.type === 'show_room' && (
            <TouchableOpacity style={s.actionBtn}>
              <Text style={s.actionBtnText}>🗺️ Show on Map</Text>
            </TouchableOpacity>
          )}
          {item.action?.type === 'show_schedule' && (
            <TouchableOpacity style={s.actionBtn}>
              <Text style={s.actionBtnText}>📅 View Schedule</Text>
            </TouchableOpacity>
          )}
          <Text style={[s.timeText, !isBot && { color: 'rgba(255,255,255,0.6)' }]}>{time}</Text>
        </View>
      </View>
    );
  };

  const renderTyping = () => (
    <View style={[s.msgRow, s.msgRowBot]}>
      <View style={s.avatar}><Text style={{ fontSize: 14 }}>🎓</Text></View>
      <View style={[s.bubble, s.bubbleBot, { paddingHorizontal: 16, paddingVertical: 14 }]}>
        <View style={s.typingDots}>
          <View style={[s.dot, { opacity: 0.4 }]} />
          <View style={[s.dot, { opacity: 0.7 }]} />
          <View style={s.dot} />
        </View>
      </View>
    </View>
  );

  return (
    <SafeArea style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAvatar}><Text style={{ fontSize: 20 }}>🎓</Text></View>
        <View>
          <Text style={s.headerTitle}>Campus Assistant</Text>
          <Text style={s.headerStatus}>🟢 Online</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => i.id}
          renderItem={renderMessage}
          contentContainerStyle={s.messagesList}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={loading ? renderTyping : null}
        />

        {/* Quick questions */}
        {showQuick && (
          <View style={s.quickWrap}>
            <Text style={s.quickLabel}>Quick questions:</Text>
            <View style={s.quickBtns}>
              {QUICK_QUESTIONS.map(q => (
                <TouchableOpacity
                  key={q}
                  style={s.quickBtn}
                  onPress={() => sendMessage(q.replace(/^[^\s]+\s/, ''))}
                >
                  <Text style={s.quickBtnText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input */}
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about rooms, schedule..."
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.sendBtnText}>➤</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeArea>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.bg },
  header:       { backgroundColor: COLORS.najahBlue, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderBottomWidth: 2, borderBottomColor: COLORS.gold },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },

  messagesList: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.lg },

  msgRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  msgRowBot: { justifyContent: 'flex-start' },
  msgRowUser:{ flexDirection: 'row-reverse' },

  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.najahLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  bubble:      { maxWidth: '78%', padding: SPACING.md, borderRadius: 16 },
  bubbleBot:   { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleUser:  { backgroundColor: COLORS.najahBlue, borderBottomRightRadius: 4 },
  bubbleError: { backgroundColor: '#fff5f5', borderColor: '#fed7d7' },

  bubbleText: { fontSize: 13, lineHeight: 20, color: COLORS.text },
  timeText:   { fontSize: 10, color: COLORS.muted, marginTop: 4, textAlign: 'right' },

  actionBtn:     { marginTop: 8, backgroundColor: COLORS.najahBlue, padding: 8, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.muted },

  quickWrap: { padding: SPACING.md, borderTopWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  quickLabel:{ fontSize: 11, color: COLORS.muted, fontWeight: '600', marginBottom: 8 },
  quickBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickBtn:  { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.najahLight, borderRadius: 20, borderWidth: 1, borderColor: '#c3d4ee' },
  quickBtnText: { fontSize: 11, color: COLORS.najahBlue, fontWeight: '500' },

  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: SPACING.md, borderTopWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  input:     { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, color: COLORS.text, maxHeight: 80 },
  sendBtn:         { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.najahBlue, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { color: '#fff', fontSize: 16 },
});
