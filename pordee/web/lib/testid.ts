// ชื่อ data-testid มาตรฐาน: <หน้า>-<สิ่งของ>[-<รหัส>] เช่น tid('watch','row','AAPL') = 'watch-row-AAPL'
// ทุกปุ่ม ช่องกรอก ผลลัพธ์ และข้อความ error ต้องมี (NFR-16) · ห้ามซ้ำในหน้าเดียวกัน
export const tid = (page: string, thing: string, id?: string | number) =>
  id === undefined || id === '' ? `${page}-${thing}` : `${page}-${thing}-${id}`;
