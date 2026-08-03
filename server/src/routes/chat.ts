import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type RequestWithUser } from "../middlewares/auth.js";
import { sendPushToUser, sendPushToAllExcept } from "../utils/webpush.js";

const sendMessageSchema = z.object({ content: z.string().min(1).max(2000) });

export const chatRouter = Router();
chatRouter.use(requireAuth);

// GET /api/chat/contacts
chatRouter.get("/contacts", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const users = await prisma.user.findMany({
      where: { id: { not: me }, isActive: true },
      select: { id: true, fullName: true, role: true, profilePhoto: true },
      orderBy: { fullName: "asc" }
    });
    res.json(users);
  } catch (err) { next(err); }
});

// GET /api/chat/conversations
chatRouter.get("/conversations", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const messages = await prisma.message.findMany({
      where: { OR: [{ senderId: me }, { receiverId: me }] },
      orderBy: { createdAt: "desc" },
      include: {
        sender:   { select: { id: true, fullName: true, profilePhoto: true, role: true } },
        receiver: { select: { id: true, fullName: true, profilePhoto: true, role: true } }
      }
    });
    const seen = new Map<string, { contact: { id: string; fullName: string; profilePhoto: string | null; role: string }; lastMessage: (typeof messages)[0]; unread: number }>();
    for (const msg of messages) {
      const contactId = msg.senderId === me ? msg.receiverId : msg.senderId;
      const contact   = msg.senderId === me ? msg.receiver   : msg.sender;
      if (!seen.has(contactId)) seen.set(contactId, { contact, lastMessage: msg, unread: 0 });
      if (msg.receiverId === me && !msg.isRead) seen.get(contactId)!.unread += 1;
    }
    res.json(Array.from(seen.values()).map(({ contact, lastMessage, unread }) => ({
      contact,
      lastMessage: { id: lastMessage.id, content: lastMessage.content, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt },
      unread
    })));
  } catch (err) { next(err); }
});

// ─── Group routes (MUST be before /:contactId to avoid shadowing) ─────────────

// GET /api/chat/group/messages
chatRouter.get("/group/messages", async (req: RequestWithUser, res, next) => {
  try {
    const messages = await prisma.groupMessage.findMany({
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { sender: { select: { id: true, fullName: true, profilePhoto: true, role: true } } }
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/chat/group
chatRouter.post("/group", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const { content } = sendMessageSchema.parse(req.body);
    const message = await prisma.groupMessage.create({
      data: { senderId: me, content },
      include: { sender: { select: { id: true, fullName: true, profilePhoto: true, role: true } } }
    });
    res.status(201).json(message);
    // Push to everyone else (non-blocking)
    void sendPushToAllExcept(me, {
      title: `${message.sender.fullName} in Everyone`,
      body:  content.length > 80 ? content.slice(0, 80) + "…" : content,
      url:   "/",
      tag:   "group-chat"
    });
  } catch (err) { next(err); }
});

// GET /api/chat/group/unread
chatRouter.get("/group/unread", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    const status = await prisma.groupMessageReadStatus.findUnique({ where: { userId: me } });
    const count = await prisma.groupMessage.count({
      where: {
        senderId: { not: me },
        ...(status ? { createdAt: { gt: status.lastReadAt } } : {})
      }
    });
    res.json({ count });
  } catch (err) { next(err); }
});

// PATCH /api/chat/group/read
chatRouter.patch("/group/read", async (req: RequestWithUser, res, next) => {
  try {
    const me = req.authUser!.id;
    await prisma.groupMessageReadStatus.upsert({
      where:  { userId: me },
      update: { lastReadAt: new Date() },
      create: { userId: me, lastReadAt: new Date() }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── DM routes ─────────────────────────────────────────────────────────────────

// GET /api/chat/:contactId/messages
chatRouter.get("/:contactId/messages", async (req: RequestWithUser, res, next) => {
  try {
    const me        = req.authUser!.id;
    const contactId = req.params.contactId;
    const before    = req.query.before as string | undefined;
    const messages  = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: me,        receiverId: contactId },
          { senderId: contactId, receiverId: me }
        ],
        ...(before ? { createdAt: { lt: new Date(before) } } : {})
      },
      orderBy: { createdAt: "asc" },
      take: 50
    });
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/chat/:contactId
chatRouter.post("/:contactId", async (req: RequestWithUser, res, next) => {
  try {
    const me        = req.authUser!.id;
    const contactId = req.params.contactId;
    if (contactId === me) { res.status(400).json({ message: "Cannot message yourself" }); return; }
    const contact = await prisma.user.findUnique({ where: { id: contactId, isActive: true } });
    if (!contact) { res.status(404).json({ message: "User not found" }); return; }
    const sender = await prisma.user.findUnique({ where: { id: me }, select: { fullName: true } });
    const { content } = sendMessageSchema.parse(req.body);
    const message = await prisma.message.create({ data: { senderId: me, receiverId: contactId, content } });
    res.status(201).json(message);
    // Push to recipient (non-blocking)
    void sendPushToUser(contactId, {
      title: sender?.fullName ?? "New message",
      body:  content.length > 80 ? content.slice(0, 80) + "…" : content,
      url:   "/",
      tag:   `dm-${me}`
    });
  } catch (err) { next(err); }
});

// PATCH /api/chat/:contactId/read
chatRouter.patch("/:contactId/read", async (req: RequestWithUser, res, next) => {
  try {
    const me        = req.authUser!.id;
    const contactId = req.params.contactId;
    await prisma.message.updateMany({
      where: { senderId: contactId, receiverId: me, isRead: false },
      data:  { isRead: true }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/chat/:contactId/unread
chatRouter.get("/:contactId/unread", async (req: RequestWithUser, res, next) => {
  try {
    const me        = req.authUser!.id;
    const contactId = req.params.contactId;
    const count = await prisma.message.count({
      where: { senderId: contactId, receiverId: me, isRead: false }
    });
    res.json({ count });
  } catch (err) { next(err); }
});
