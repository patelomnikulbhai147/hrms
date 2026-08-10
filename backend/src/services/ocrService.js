// Mock OCR Service
// In production, this would use tesseract.js, pdf-parse, or AWS Textract to parse the file URL.

exports.extractData = async (fileUrl, fileType) => {
  console.log(`[OCR Service] Analyzing file: ${fileUrl}`);
  
  // Simulated delay for OCR processing
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Mock extracted text
  const ocrText = `
    INVOICE #INV-4021
    Date: 2026-08-08
    To: Acme Corp
    Amount: $4,500.00
    Tax: $250.00
    Total: $4,750.00
    Thank you for your business.
  `;

  // Mock Smart Extraction (NER)
  const extractedData = {
    invoiceNumber: "INV-4021",
    date: "2026-08-08",
    company: "Acme Corp",
    totalAmount: 4750.00,
    tags: ["Invoice", "Acme", "Q3"]
  };

  return { ocrText, extractedData };
};
