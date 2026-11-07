'use client';
// error ที่เกิดใน layout เอง (error.tsx ของ [lang] จับไม่ได้) · หน้าไม่ล่ม (NFR-10)
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, background: '#f7f4ec', color: '#14213d' }}>
        <section data-testid="global-error-page">
          <h1>พอดีพอร์ต · Pordee Port</h1>
          <p>เกิดข้อผิดพลาด กรุณาลองใหม่ / Something went wrong. Please try again.</p>
          <p><strong>ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน</strong></p>
          <button data-testid="global-error-retry" onClick={() => reset()}>ลองใหม่ / Retry</button>
        </section>
      </body>
    </html>
  );
}
