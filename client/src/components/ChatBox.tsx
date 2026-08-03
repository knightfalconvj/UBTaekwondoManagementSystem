import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";

type Contact = {
  id: string;
  fullName: string;
  role: string;
  profilePhoto: string | null;
};

type Conversation = {
  contact: Contact;
  lastMessage: { id: string; content: string; senderId: string; createdAt: string };
  unread: number;
};

type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
};

type GroupMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { id: string; fullName: string; profilePhoto: string | null; role: string };
};

type View = "bubble" | "list" | "thread" | "group";

export function ChatBox() {
  const { user } = useAuth();
  const [view, setView]                   = useState<View>("bubble");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupUnread, setGroupUnread]     = useState(0);
  const [draft, setDraft]                 = useState("");
  const [sending, setSending]             = useState(false);
  const [search, setSearch]               = useState("");
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLInputElement>(null);
  const dmPollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const groupPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0) + groupUnread;

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<Conversation[]>("/chat/conversations");
      setConversations(data);
    } catch { /* ignore */ }
  }, [user]);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<Contact[]>("/chat/contacts");
      setContacts(data);
    } catch { /* ignore */ }
  }, [user]);

  const loadMessages = useCallback(async (contactId: string) => {
    try {
      const { data } = await api.get<Message[]>(`/chat/${contactId}/messages`);
      setMessages(data);
    } catch { /* ignore */ }
  }, []);

  const loadGroupMessages = useCallback(async () => {
    try {
      const { data } = await api.get<GroupMessage[]>("/chat/group/messages");
      setGroupMessages(data);
    } catch { /* ignore */ }
  }, []);

  const loadGroupUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get<{ count: number }>("/chat/group/unread");
      setGroupUnread(data.count);
    } catch { /* ignore */ }
  }, [user]);

  // ─── Polling — conversations list ──────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    void loadConversations();
    void loadGroupUnread();
    const id = setInterval(() => {
      void loadConversations();
      void loadGroupUnread();
    }, 5000);
    return () => clearInterval(id);
  }, [user, loadConversations, loadGroupUnread]);

  // ─── Polling — DM thread ───────────────────────────────────────────────────

  useEffect(() => {
    if (!activeContact || view !== "thread") {
      if (dmPollRef.current) { clearInterval(dmPollRef.current); dmPollRef.current = null; }
      return;
    }

    void loadMessages(activeContact.id);
    void api.patch(`/chat/${activeContact.id}/read`).then(() => void loadConversations()).catch(() => {/* ignore */});

    dmPollRef.current = setInterval(() => {
      void loadMessages(activeContact.id);
      void api.patch(`/chat/${activeContact.id}/read`).then(() => void loadConversations()).catch(() => {/* ignore */});
    }, 3000);

    return () => {
      if (dmPollRef.current) { clearInterval(dmPollRef.current); dmPollRef.current = null; }
    };
  }, [activeContact, view, loadMessages, loadConversations]);

  // ─── Polling — group thread ────────────────────────────────────────────────

  useEffect(() => {
    if (view !== "group") {
      if (groupPollRef.current) { clearInterval(groupPollRef.current); groupPollRef.current = null; }
      return;
    }

    void loadGroupMessages();
    void api.patch("/chat/group/read").then(() => setGroupUnread(0)).catch(() => {/* ignore */});

    groupPollRef.current = setInterval(() => {
      void loadGroupMessages();
      void api.patch("/chat/group/read").then(() => setGroupUnread(0)).catch(() => {/* ignore */});
    }, 3000);

    return () => {
      if (groupPollRef.current) { clearInterval(groupPollRef.current); groupPollRef.current = null; }
    };
  }, [view, loadGroupMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (view === "thread" || view === "group") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, groupMessages, view]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const openList = () => {
    void loadConversations();
    void loadContacts();
    void loadGroupUnread();
    setView("list");
  };

  const openThread = (contact: Contact) => {
    setActiveContact(contact);
    setMessages([]);
    setDraft("");
    setView("thread");
  };

  const openGroup = () => {
    setGroupMessages([]);
    setDraft("");
    setView("group");
  };

  const closeAll = () => {
    setView("bubble");
    setActiveContact(null);
    setMessages([]);
    setGroupMessages([]);
  };

  const backToList = () => {
    setActiveContact(null);
    setMessages([]);
    setGroupMessages([]);
    setView("list");
  };

  const sendDM = async () => {
    if (!draft.trim() || !activeContact || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      senderId: user!.id,
      receiverId: activeContact.id,
      content: text,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await api.post(`/chat/${activeContact.id}`, { content: text });
      await loadMessages(activeContact.id);
      await loadConversations();
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  const sendGroupMessage = async () => {
    if (!draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);

    const optimistic: GroupMessage = {
      id: `opt-${Date.now()}`,
      senderId: user!.id,
      content: text,
      createdAt: new Date().toISOString(),
      sender: { id: user!.id, fullName: user!.fullName, profilePhoto: user!.profilePhoto ?? null, role: user!.role }
    };
    setGroupMessages((prev) => [...prev, optimistic]);

    try {
      await api.post("/chat/group", { content: text });
      await loadGroupMessages();
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (view === "group") void sendGroupMessage();
      else void sendDM();
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const filteredContacts = contacts.filter((c) =>
    c.fullName.toLowerCase().includes(search.toLowerCase())
  );

  // Merge conversations + contacts that have no convo yet
  const listedContacts: (Contact & { unread: number; lastText: string; lastTime: string | null })[] = [
    ...conversations.map((cv) => ({
      ...cv.contact,
      unread: cv.unread,
      lastText: cv.lastMessage.content,
      lastTime: cv.lastMessage.createdAt
    })),
    ...filteredContacts
      .filter((c) => !conversations.find((cv) => cv.contact.id === c.id))
      .map((c) => ({ ...c, unread: 0, lastText: "", lastTime: null }))
  ].filter((c) =>
    c.fullName.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const avatarUrl = (c: { profilePhoto: string | null }) =>
    c.profilePhoto ? `${API_BASE.replace("/api", "")}${c.profilePhoto}` : null;

  const avatarFallback = (name: string) => name.charAt(0).toUpperCase();

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (!user) return null;

  // ─── Bubble ─────────────────────────────────────────────────────────────────
  if (view === "bubble") {
    return (
      <button
        type="button"
        className="chat-bubble"
        aria-label="Open UBTKD Chatbox"
        onClick={openList}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.268 2 11.5c0 2.671 1.192 5.073 3.113 6.82L4.5 21.5l3.63-1.553A10.9 10.9 0 0012 21c5.523 0 10-4.268 10-9.5S17.523 2 12 2z"/>
        </svg>
        {totalUnread > 0 && (
          <span className="chat-bubble-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
        )}
      </button>
    );
  }

  // ─── Conversation list ───────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="chat-panel" role="dialog" aria-label="UBTKD Chatbox">
        <header className="chat-panel-header">
          <span>UBTKD Chatbox</span>
          <button type="button" className="chat-close-btn" onClick={closeAll} aria-label="Close chat">✕</button>
        </header>

        {/* Group chat row */}
        <button
          type="button"
          className={`chat-contact-row group-row${groupUnread > 0 ? " has-unread" : ""}`}
          onClick={openGroup}
        >
          <div className="chat-avatar group-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div className="chat-contact-info">
            <span className="chat-contact-name">Everyone</span>
            <span className="chat-contact-last">Group chat · all members</span>
          </div>
          <div className="chat-contact-meta">
            {groupUnread > 0 && <span className="chat-unread-badge">{groupUnread}</span>}
          </div>
        </button>

        <div className="chat-list-divider">Direct Messages</div>

        <div className="chat-search-wrap">
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="chat-search-input"
            autoFocus
          />
        </div>

        <div className="chat-contact-list">
          {listedContacts.length === 0 && (
            <p className="chat-empty">No contacts found.</p>
          )}
          {listedContacts.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chat-contact-row${c.unread > 0 ? " has-unread" : ""}`}
              onClick={() => openThread(c)}
            >
              <div className="chat-avatar">
                {avatarUrl(c)
                  ? <img src={avatarUrl(c)!} alt={c.fullName} />
                  : <span>{avatarFallback(c.fullName)}</span>}
              </div>
              <div className="chat-contact-info">
                <span className="chat-contact-name">{c.fullName}</span>
                {c.lastText && (
                  <span className="chat-contact-last">{c.lastText.length > 38 ? c.lastText.slice(0, 38) + "…" : c.lastText}</span>
                )}
              </div>
              <div className="chat-contact-meta">
                {c.lastTime && <span className="chat-contact-time">{formatTime(c.lastTime)}</span>}
                {c.unread > 0 && <span className="chat-unread-badge">{c.unread}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Group thread ─────────────────────────────────────────────────────────────
  if (view === "group") {
    return (
      <div className="chat-panel" role="dialog" aria-label="Everyone group chat">
        <header className="chat-panel-header thread">
          <button type="button" className="chat-back-btn" onClick={backToList} aria-label="Back">‹</button>
          <div className="chat-avatar small group-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div className="chat-thread-title">
            <span className="chat-contact-name">Everyone</span>
            <small>Group chat · all members</small>
          </div>
          <button type="button" className="chat-close-btn" onClick={closeAll} aria-label="Close chat">✕</button>
        </header>

        <div className="chat-messages">
          {groupMessages.length === 0 && (
            <p className="chat-empty center">Be the first to say something! 👋</p>
          )}
          {groupMessages.map((msg, idx) => {
            const isMine = msg.senderId === user.id;
            const prevMsg = idx > 0 ? groupMessages[idx - 1] : null;
            const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
            const showSender = !isMine && (!prevMsg || prevMsg.senderId !== msg.senderId || showDate);
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="chat-date-divider">
                    {new Date(msg.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                )}
                <div className={`chat-msg-row${isMine ? " mine" : ""}`}>
                  {!isMine && (
                    <div className="chat-avatar tiny">
                      {avatarUrl(msg.sender)
                        ? <img src={avatarUrl(msg.sender)!} alt={msg.sender.fullName} />
                        : <span>{avatarFallback(msg.sender.fullName)}</span>}
                    </div>
                  )}
                  <div className="chat-bubble-msg">
                    {showSender && (
                      <span className="chat-sender-name">{msg.sender.fullName}</span>
                    )}
                    <span>{msg.content}</span>
                    <time>{formatTime(msg.createdAt)}</time>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-row">
          <input
            ref={inputRef}
            type="text"
            placeholder="Message everyone..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="chat-input"
            autoFocus
            maxLength={2000}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={() => void sendGroupMessage()}
            disabled={!draft.trim() || sending}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ─── DM Thread ───────────────────────────────────────────────────────────────
  return (
    <div className="chat-panel" role="dialog" aria-label={`Chat with ${activeContact?.fullName}`}>
      <header className="chat-panel-header thread">
        <button type="button" className="chat-back-btn" onClick={backToList} aria-label="Back">‹</button>
        <div className="chat-avatar small">
          {avatarUrl(activeContact!)
            ? <img src={avatarUrl(activeContact!)!} alt={activeContact!.fullName} />
            : <span>{avatarFallback(activeContact!.fullName)}</span>}
        </div>
        <div className="chat-thread-title">
          <span className="chat-contact-name">{activeContact!.fullName}</span>
          <small>{activeContact!.role === "ADMIN" ? "Coach / Admin" : "Athlete"}</small>
        </div>
        <button type="button" className="chat-close-btn" onClick={closeAll} aria-label="Close chat">✕</button>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty center">Say hello! 👋</p>
        )}
        {messages.map((msg, idx) => {
          const isMine = msg.senderId === user.id;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="chat-date-divider">
                  {new Date(msg.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </div>
              )}
              <div className={`chat-msg-row${isMine ? " mine" : ""}`}>
                {!isMine && (
                  <div className="chat-avatar tiny">
                    {avatarUrl(activeContact!)
                      ? <img src={avatarUrl(activeContact!)!} alt={activeContact!.fullName} />
                      : <span>{avatarFallback(activeContact!.fullName)}</span>}
                  </div>
                )}
                <div className="chat-bubble-msg">
                  <span>{msg.content}</span>
                  <time>{formatTime(msg.createdAt)}</time>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          ref={inputRef}
          type="text"
          placeholder="Aa"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="chat-input"
          autoFocus
          maxLength={2000}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={() => void sendDM()}
          disabled={!draft.trim() || sending}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
