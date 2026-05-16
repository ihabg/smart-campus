import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { chatAPI } from '../api';
import { ScreenHeader } from '../components/ui';
import { COLORS, RADIUS, SPACING } from '../theme';
import { getErrorMessage, unwrapApi } from '../utils/helpers';

const QUICK = [
  'Where is room 2050?',
  'What classes do I have today?',
  'Find the nearest restroom',
  'Where is Dr. office?',
];

export default function ChatScreen({ navigation }) {
  const listRef = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'bot',
      text: 'Hi, I am your Smart Campus Assistant. Ask me about rooms, schedule, restrooms, offices, and directions.',
    },
  ]);

  const send = useCallback(async (preset) => {
    const text = (preset || input).trim();
    if (!text || loading) return;

    setInput('');
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-u`, role: 'user', text },
    ]);
    setLoading(true);

    try {
      const response = await chatAPI.send(text);
      const payload = unwrapApi(response);
      const reply = payload.message || payload.reply || 'I received your message.';

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-b`,
          role: 'bot',
          text: reply,
          action: payload.action,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-e`,
          role: 'bot',
          text: getErrorMessage(error, 'Sorry, I could not connect to the assistant right now.'),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 80);
    }
  }, [input, loading]);

  function handleAction(action) {
    if (!action) return;

    if (action.type === 'show_room') {
      navigation.navigate('MainTabs', {
        screen: 'MapTab',
        params: { roomNumber: action.roomNumber || action.room_number },
      });
    }

    if (action.type === 'show_schedule') {
      navigation.navigate('MainTabs', { screen: 'ScheduleTab' });
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Campus Assistant" subtitle="Online · AI feature" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
          renderItem={({ item }) => {
            const bot = item.role === 'bot';
            return (
              <View style={[styles.messageRow, bot ? styles.botRow : styles.userRow]}>
                <View style={[styles.bubble, bot ? styles.botBubble : styles.userBubble, item.error && styles.errorBubble]}>
                  <Text style={[styles.messageText, !bot && { color: '#fff' }]}>{item.text}</Text>
                  {item.action ? (
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleAction(item.action)}>
                      <Text style={styles.actionText}>Open result</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListFooterComponent={loading ? (
            <View style={[styles.messageRow, styles.botRow]}>
              <View style={[styles.bubble, styles.botBubble]}>
                <ActivityIndicator color={COLORS.najahBlue} />
              </View>
            </View>
          ) : null}
        />

        <View style={styles.quickWrap}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={QUICK}
            keyExtractor={(item) => item}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.quickButton} onPress={() => send(item)}>
                <Text style={styles.quickText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about rooms, schedule..."
            placeholderTextColor={COLORS.faint}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  messageRow: { flexDirection: 'row', marginBottom: 8 },
  botRow: { justifyContent: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 18, padding: SPACING.md },
  botBubble: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 5 },
  userBubble: { backgroundColor: COLORS.najahBlue, borderBottomRightRadius: 5 },
  errorBubble: { backgroundColor: COLORS.redBg, borderColor: '#f2b8b8' },
  messageText: { color: COLORS.text, lineHeight: 20 },
  actionButton: { marginTop: 10, backgroundColor: COLORS.najahBlue, borderRadius: RADIUS.md, padding: 9, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '900' },
  quickWrap: { backgroundColor: COLORS.panel, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  quickButton: { backgroundColor: COLORS.najahLight, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 8 },
  quickText: { color: COLORS.najahBlue, fontSize: 12, fontWeight: '800' },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: SPACING.md, backgroundColor: COLORS.panel, borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, maxHeight: 90, minHeight: 44, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, paddingHorizontal: SPACING.md, paddingVertical: 10, color: COLORS.text },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.najahBlue, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
