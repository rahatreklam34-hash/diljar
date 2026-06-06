import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ApiError } from '../../lib/http';

const router = Router();

const createSchema = z.object({
  subject: z.string().min(3, 'Konu gerekli'),
  category: z.enum(['teknik', 'fatura', 'genel']).default('genel'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  message: z.string().min(1, 'Mesaj gerekli'),
});

const messageSchema = z.object({ content: z.string().min(1, 'Mesaj gerekli') });

// GET /tickets — tenant'ın kendi talepleri
router.get('/tickets', asyncHandler(async (req: Request, res: Response) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  res.json(tickets);
}));

// GET /tickets/:id — detay + mesajlar
router.get('/tickets/:id', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) throw new ApiError(404, 'Talep bulunamadı');
  res.json(ticket);
}));

// POST /tickets — yeni talep + ilk mesaj
router.post('/tickets', asyncHandler(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: req.tenantId!,
      userId: req.auth!.userId,
      subject: data.subject,
      category: data.category,
      priority: data.priority,
      status: 'OPEN',
      messages: {
        create: { senderUserId: req.auth!.userId, content: data.message, isAdmin: false },
      },
    },
    include: { messages: true },
  });
  res.status(201).json(ticket);
}));

// POST /tickets/:id/messages — kullanıcı yanıtı
router.post('/tickets/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const data = messageSchema.parse(req.body);
  const ticket = await prisma.supportTicket.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!ticket) throw new ApiError(404, 'Talep bulunamadı');
  const msg = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, senderUserId: req.auth!.userId, content: data.content, isAdmin: false },
  });
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN', updatedAt: new Date() } });
  res.status(201).json(msg);
}));

export default router;
