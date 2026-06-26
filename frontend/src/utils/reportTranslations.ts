// Client-side translation registry for HRMS reports.
// Maps standard English report headers, column labels, static descriptions, 
// and statutory text into Hindi (hi) and Gujarati (gu).

export interface Translations {
  hi: string;
  gu: string;
}

// Languages offered in the Report Configuration UI. Add a new entry here (plus its
// strings in the dictionary below) to surface another language everywhere reports
// are previewed/exported — no UI changes required. `code` is passed to `t()`.
export interface ReportLanguage {
  code: string;
  label: string;
}
export const REPORT_LANGUAGES: ReportLanguage[] = [
  { code: 'en', label: '🇬🇧 English (Default)' },
  { code: 'hi', label: '🇮🇳 हिन्दी (Hindi)' },
  { code: 'gu', label: '🇮🇳 ગુજરાતી (Gujarati)' },
];

// Persisted user choice → reused as the default next time (req: "Remember Selection").
export const REPORT_LANG_STORAGE_KEY = 'hrms_report_language';

const translationDictionary: Record<string, Translations> = {
  // --- General & Column Headers ---
  "sr": { hi: "क्र.", gu: "ક્રમ" },
  "sr.": { hi: "क्र.", gu: "ક્રમ" },
  "sr. no": { hi: "क्रम संख्या", gu: "ક્રમ નંબર" },
  "sr. no.": { hi: "क्रम संख्या", gu: "ક્રમ નંબર" },
  "emp id": { hi: "कर्मचारी आईडी", gu: "કર્મચારી આઈડી" },
  "employee id": { hi: "कर्मचारी आईडी", gu: "કર્મચારી આઈડી" },
  "employee code": { hi: "कर्मचारी कोड", gu: "કર્મચારી કોડ" },
  "employee name": { hi: "कर्मचारी का नाम", gu: "કર્મચારીનું નામ" },
  "name": { hi: "नाम", gu: "નામ" },
  "department": { hi: "विभाग", gu: "વિભાગ" },
  "dept": { hi: "विभाग", gu: "વિભાગ" },
  "designation": { hi: "पद", gu: "હોદ્દો" },
  "period": { hi: "अवधि", gu: "ગાળો" },
  "month": { hi: "महीना", gu: "મહિનો" },
  "year": { hi: "वर्ष", gu: "વર્ષ" },
  "basic": { hi: "मूल वेतन", gu: "મૂળ પગાર" },
  "basic salary": { hi: "मूल वेतन", gu: "મૂળ પગાર" },
  "allowances": { hi: "भत्ते", gu: "ભથ્થાં" },
  "allowance": { hi: "भत्ता", gu: "ભથ્થું" },
  "hra": { hi: "मकान किराया भत्ता", gu: "ઘર ભાડું ભથ્થું" },
  "o. allowance": { hi: "अन्य भत्ता", gu: "અન્ય ભથ્થું" },
  "other allowance": { hi: "अन्य भत्ता", gu: "અન્ય ભથ્થું" },
  "bonus": { hi: "बोनस", gu: "બોનસ" },
  "deductions": { hi: "कटौतियां", gu: "કપાત" },
  "deduction": { hi: "कटौती", gu: "કપાત" },
  "total ded.": { hi: "कुल कटौती", gu: "કુલ કપાત" },
  "total deductions": { hi: "कुल कटौतियां", gu: "કુલ કપાતો" },
  "tax": { hi: "कर", gu: "કર" },
  "prof. tax": { hi: "व्यवसाय कर", gu: "વ્યવસાય કર" },
  "professional tax": { hi: "व्यवसाय कर", gu: "વ્યવસાય કર" },
  "tds": { hi: "स्रोत पर कर कटौती (TDS)", gu: "ટીડીએસ" },
  "net pay": { hi: "शुद्ध वेतन", gu: "ચોખ્ખો પગાર" },
  "net salary": { hi: "शुद्ध वेतन", gu: "ચોખ્ખો પગાર" },
  "present day": { hi: "उपस्थिति दिन", gu: "હાજર દિવસ" },
  "present days": { hi: "उपस्थिति दिन", gu: "હાજર દિવસો" },
  "absent day": { hi: "अनुपस्थिति दिन", gu: "ગેરહાજર દિવસ" },
  "absent days": { hi: "अनुपस्थिति दिन", gu: "ગેરહાજર દિવસો" },
  "total leaves": { hi: "कुल छुट्टियां", gu: "કુલ રજાઓ" },
  "cl taken": { hi: "आकस्मिक अवकाश (CL)", gu: "આકસ્મિક રજા (CL)" },
  "sl taken": { hi: "चिकित्सा अवकाश (SL)", gu: "બીમારી રજા (SL)" },
  "pl taken": { hi: "अर्जित अवकाश (PL)", gu: "અર્જિત રજા (PL)" },
  "lwp": { hi: "बिना वेतन के अवकाश (LWP)", gu: "પગાર વિનાની રજા (LWP)" },
  "lwp days": { hi: "बिना वेतन के अवकाश दिन", gu: "પગાર વિનાની રજાના દિવસો" },
  "ot hrs": { hi: "अतिरिक्त समय (घंटे)", gu: "ઓવरटाइम कलो" },
  "overtime hours": { hi: "अतिरिक्त समय (घंटे)", gu: "ઓવરટાઇમ કલાકો" },
  "total day": { hi: "कुल दिन", gu: "કુલ દિવસ" },
  "total days": { hi: "कुल दिन", gu: "કુલ દિવસો" },
  "payable days": { hi: "भुगतान योग्य दिन", gu: "ચુકવવાપાત્ર દિવસો" },
  "total earnings": { hi: "कुल कमाई", gu: "કુલ કમાણી" },
  "uan no.": { hi: "यूएएन नंबर", gu: "યુએએન નંબર" },
  "pf no.": { hi: "पीएफ नंबर", gu: "પીએફ નંબર" },
  "esic no.": { hi: "ईएसआईसी नंबर", gu: "ઈએસઆઈસી નંબર" },
  "work place": { hi: "कार्यस्थल", gu: "કાર્યસ્થળ" },
  "status": { hi: "स्थिति", gu: "સ્થિતિ" },
  "pf": { hi: "पीएफ", gu: "પીએફ" },
  "esic": { hi: "ईएसआईसी", gu: "ઈએસઆઈસી" },
  "other": { hi: "अन्य", gu: "અન્ય" },

  // --- Payment / Footer ---
  "payment transferred to employee a/c no.": {
    hi: "भुगतान कर्मचारी के खाता संख्या",
    gu: "ચુકવણી કર્મચારીના ખાતા નંબર"
  },
  "via": { hi: "द्वारा", gu: "દ્વારા" },
  "authorized signatory": { hi: "अधिकृत हस्ताक्षरकर्ता", gu: "અધિકૃત સહી કરનાર" },
  "authorised signatory": { hi: "अधिकृत हस्ताक्षरकर्ता", gu: "અધિકૃત સહી કરનાર" },
  "for": { hi: "कृते", gu: "માટે" },
  "grand total": { hi: "कुल योग", gu: "કુલ સરવાળો" },
  "company subtotal": { hi: "कंपनी उप-योग", gu: "કંપની પેટાસરવાળો" },
  "employees": { hi: "कर्मचारी", gu: "કર્મચારીઓ" },
  "generated on": { hi: "उत्पन्न तिथि", gu: "જનરેટ કરેલ તારીખ" },
  "generated": { hi: "उत्पन्न किया गया", gu: "જનરેટ કરેલ" },
  "by": { hi: "द्वारा", gu: "દ્વારા" },
  "report": { hi: "रिपोर्ट", gu: "અહેવાલ" },
  "salary register": { hi: "वेतन रजिस्टर", gu: "પગાર રજિસ્ટર" },
  "form 16": { hi: "फॉर्म 16", gu: "ફોર્મ ૧૬" },

  // --- No Data Messages ---
  "no payslips for the selected period.": {
    hi: "चयनित अवधि के लिए कोई वेतन पर्ची उपलब्ध नहीं है।",
    gu: "પસંદ કરેલા સમયગાળા માટે કોઈ પગાર સ્લિપ ઉપલબ્ધ નથી."
  },
  "no salary records for the selected period.": {
    hi: "चयनित अवधि के लिए कोई वेतन रिकॉर्ड उपलब्ध नहीं है।",
    gu: "પસંદ કરેલા સમયગાળા માટે કોઈ પગાર રેકોર્ડ ઉપલબ્ધ નથી."
  },
  "no form 16 data for the selected year.": {
    hi: "चयनित वर्ष के लिए कोई फॉर्म 16 डेटा उपलब्ध नहीं है।",
    gu: "પસંદ કરેલા વર્ષ માટે કોઈ ફોર્મ ૧૬ ડેટા ઉપલબ્ધ નથી."
  },

  // --- Form 16 Specific ---
  "certificate under section 203 of the income-tax act, 1961 for": {
    hi: "आयकर अधिनियम, 1961 की धारा 203 के तहत प्रमाणपत्र",
    gu: "આવકવેરા અધિનિયમ, 1961ની કલમ 203 હેઠળનું પ્રમાણપત્ર"
  },
  "tax deducted at source on salary": {
    hi: "वेतन पर स्रोत पर कर की कटौती",
    gu: "પગાર પર સ્રોત સ્થાને કર કપાત"
  },
  "form no. 16": { hi: "फॉर्म नंबर 16", gu: "ફોર્મ નંબર ૧૬" },
  "[see rule 31(1)(a)]": { hi: "[नियम 31(1)(a) देखें]", gu: "[જુઓ નિયમ ૩૧(૧)(અ)]" },
  "name & address of the employer": {
    hi: "नियोक्ता का नाम और पता",
    gu: "નિયોક્તાનું નામ અને સરનામું"
  },
  "name & designation of the employee": {
    hi: "कर्मचारी का नाम और पद",
    gu: "કર્મचारीનું નામ અને હોદ્દો"
  },
  "pan of deductor": { hi: "कटौतीकर्ता का पैन", gu: "કપાત કરનારનો પાન" },
  "tan of deductor": { hi: "कटौतीकर्ता का टैन", gu: "કપાત કરનારનો ટેન" },
  "pan of employee": { hi: "कर्मचारी का पैन", gu: "કર્મचारीનો પાન" },
  "cit (tds)": { hi: "सीआईटी (टीडीएस)", gu: "સીઆઈટી (ટીડીએસ)" },
  "assessment year": { hi: "कर निर्धारण वर्ष", gu: "આકારણી वर्ष" },
  "summary of tax deducted at source in respect of deductee": {
    hi: "कटौतीदार के संबंध में स्रोत पर काटे गए कर का विवरण",
    gu: "કપાત મેળવનારના સંદર્ભમાં સ્રોત સ્થાને કપાત કરેલ કરનો સારાંશ"
  },
  "quarter": { hi: "तिमाही", gu: "ત્રિમાસિક" },
  "amount of tax deducted": { hi: "काटे गए कर की राशि", gu: "કપાત કરેલ કરની રકમ" },
  "amount of tax deposited / remitted": {
    hi: "जमा / प्रेषित कर की राशि",
    gu: "જમા / મોકલેલ કરની રકમ"
  },
  "total": { hi: "कुल योग", gu: "કુલ" },
  "part-b — details of salary paid and tax deducted": {
    hi: "भाग-बी — भुगतान किए गए वेतन और काटे गए कर का विवरण",
    gu: "ભાગ-બી — ચુકવેલ પગાર અને કપાત કરેલ કરની વિગતો"
  },
  "1. gross salary — salary as per provisions u/s 17(1)": {
    hi: "1. सकल वेतन — धारा 17(1) के प्रावधानों के अनुसार वेतन",
    gu: "1. કુલ પગાર — કલમ 17(1) ના નિયમો અનુસાર પગાર"
  },
  "   (b) value of perquisites u/s 17(2)": {
    hi: "   (b) धारा 17(2) के तहत अनुलाभ का मूल्य",
    gu: "   (બી) કલમ 17(2) હેઠળ પરક્યુઝિટનું મૂલ્ય"
  },
  "   (c) profits in lieu of salary u/s 17(3)": {
    hi: "   (c) धारा 17(3) के तहत वेतन के बदले लाभ",
    gu: "   (સી) કલમ 17(3) હેઠળ પગારના બદલામાં નફો"
  },
  "   (d) total": { hi: "   (d) कुल", gu: "   (ડી) કુલ" },
  "2. less: allowance exempt u/s 10": {
    hi: "2. घटाएं: धारा 10 के तहत कर मुक्त भत्ता",
    gu: "2. બાદ કરો: કલમ 10 હેઠળ કરમુક્ત ભથ્થું"
  },
  "3. balance (1 - 2)": { hi: "3. शेष (1 - 2)", gu: "3. બાકી રહેલ (1 - 2)" },
  "4. deductions u/s 16 (entertainment / tax on employment)": {
    hi: "4. धारा 16 के तहत कटौतियां (मनोरंजन / रोजगार पर कर)",
    gu: "4. કલમ 16 હેઠળ કપાતો (મનોરંજન / રોજગાર વેરો)"
  },
  "6. income chargeable under the head “salaries”": {
    hi: "6. “वेतन” शीर्ष के अंतर्गत कर योग्य आय",
    gu: "6. “પગાર” શીર્ષક હેઠળ કરપાત્ર આવક"
  },
  "8. gross total income": { hi: "8. सकल कुल आय", gu: "8. કુલ ગ્રોસ આવક" },
  "10. aggregate deductible amount under chapter vi-a": {
    hi: "10. अध्याय VI-A के तहत कुल कटौती योग्य राशि",
    gu: "10. પ્રકરણ VI-A હેઠળ કુલ કપાતપાત્ર રકમ"
  },
  "11. total income (8 - 10)": { hi: "11. कुल आय (8 - 10)", gu: "11. કુલ આવક (8 - 10)" },
  "14. tax payable": { hi: "14. देय कर", gu: "14. ચુકવવાપાત્ર કર" },
  "17. tax deducted at source (tds)": {
    hi: "17. स्रोत पर कर कटौती (TDS)",
    gu: "17. સ્રોત સ્થાને કર કપાત (ટીડીએસ)"
  },
  "v e r i f i c a t i o n": { hi: "सत्यापन", gu: "ચકાસણી" },
  "i, on behalf of": { hi: "मैं, की ओर से", gu: "હું, વતી" },
  "certify that a sum of rs.": { hi: "प्रमाणित करता हूं कि रुपये", gu: "પ્રમાણિત કરું છું કે રૂ." },
  "has been deducted and deposited to the credit of the central government. i further certify that the information given above is true, complete and correct and is based on the books of account, documents, tds statements and other available records.": {
    hi: "की राशि काट कर केंद्र सरकार के खाते में जमा कर दी गई है। मैं आगे प्रमाणित करता हूं कि ऊपर दी गई जानकारी सत्य, पूर्ण और सही है और खातों की पुस्तकों, दस्तावेजों, टीडीएस विवरणों और अन्य उपलब्ध अभिलेखों पर आधारित है।",
    gu: "ની રકમ કપાત કરીને કેન્દ્ર સરકારના ખાતામાં જમા કરવામાં આવી છે. હું વધુમાં પ્રમાણિત કરું છું કે ઉપર આપેલી માહિતી સાચી, સંપૂર્ણ અને યોગ્ય છે અને તે હિસાબી ચોપડાઓ, દસ્તાવેજો, ટીડીએસ પત્રકો અને અન્ય ઉપલબ્ધ રેકોર્ડ્સ પર આધારિત છે。"
  },
  "place / date": { hi: "स्थान / दिनांक", gu: "સ્થળ / તારીખ" }
};

/**
 * Normalizes input text and retrieves its translation.
 * If language is 'en' or translation is not found, returns original text.
 * Future languages (Tamil, Marathi, etc.) can be added by extending the Translations interface and dictionary.
 */
export const t = (text: string, lang: string = "en"): string => {
  if (!text) return "";
  const cleanLang = String(lang).toLowerCase().trim();
  if (cleanLang === "en") return text;

  const normalizedKey = String(text).toLowerCase().trim().replace(/\s+/g, " ");
  const match = translationDictionary[normalizedKey];

  if (match) {
    if (cleanLang === "hi") return match.hi;
    if (cleanLang === "gu") return match.gu;
  }

  // Fallback for sub-strings and partial matches if needed (e.g. Account Number label containing details)
  // Check if key starts with or contains certain keywords
  for (const [key, value] of Object.entries(translationDictionary)) {
    if (key.length > 5 && normalizedKey.includes(key)) {
      if (cleanLang === "hi") return normalizedKey.replace(key, value.hi);
      if (cleanLang === "gu") return normalizedKey.replace(key, value.gu);
    }
  }

  return text;
};
