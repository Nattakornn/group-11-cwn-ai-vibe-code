// ทะเบียนไฟล์ข้อความ (หัวหน้าเป็นเจ้าของไฟล์นี้) · แต่ละโมดูลแก้เฉพาะ <โมดูล>.th.json / .en.json ของตัวเอง
import coreTh from './core.th.json'; import coreEn from './core.en.json';
import homeTh from './home.th.json'; import homeEn from './home.en.json';
import stockTh from './stock.th.json'; import stockEn from './stock.en.json';
import watchTh from './watch.th.json'; import watchEn from './watch.en.json';
import portfolioTh from './portfolio.th.json'; import portfolioEn from './portfolio.en.json';
import dividendsTh from './dividends.th.json'; import dividendsEn from './dividends.en.json';
import studyTh from './study.th.json'; import studyEn from './study.en.json';
import accountTh from './account.th.json'; import accountEn from './account.en.json';
import staffTh from './staff.th.json'; import staffEn from './staff.en.json';
type D = Record<string, string>;
export const messages: Record<string, { th: D; en: D }> = {
  core: { th: coreTh, en: coreEn }, home: { th: homeTh, en: homeEn }, stock: { th: stockTh, en: stockEn },
  watch: { th: watchTh, en: watchEn }, portfolio: { th: portfolioTh, en: portfolioEn },
  dividends: { th: dividendsTh, en: dividendsEn }, study: { th: studyTh, en: studyEn },
  account: { th: accountTh, en: accountEn }, staff: { th: staffTh, en: staffEn },
};
