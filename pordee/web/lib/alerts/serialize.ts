// แปลงแถวของตารางแจ้งเตือนเป็นรูปที่ API ตอบ (เงิน/ราคา/% เป็น string)
export type AlertRow = {
  id: number; symbol: string; kind: 'pct' | 'target'; target_price: string | null;
  direction: 'up' | 'down' | null; active: boolean; created_at: Date;
};
export const alertCols = 'id, symbol, kind, target_price, direction, active, created_at';

export const toAlert = (r: AlertRow) => ({
  id: r.id, symbol: r.symbol, kind: r.kind, targetPrice: r.target_price, direction: r.direction,
  active: r.active, createdAt: new Date(r.created_at).toISOString(),
});

export type EventRow = {
  id: number; alert_id: number; symbol: string; kind: 'pct' | 'target'; price: string; change_pct: string | null;
  triggered_at: Date; in_quiet_hours: boolean; read_at: Date | null; target_price: string | null;
};

export const toInboxItem = (r: EventRow) => ({
  id: r.id, alertId: r.alert_id, symbol: r.symbol, kind: r.kind, price: r.price, changePct: r.change_pct,
  targetPrice: r.target_price, triggeredAt: new Date(r.triggered_at).toISOString(),
  inQuietHours: r.in_quiet_hours, read: r.read_at !== null,
});
