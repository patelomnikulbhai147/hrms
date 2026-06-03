const fs = require('fs');

let content = fs.readFileSync('backend/src/controllers/companyController.js', 'utf-8');

const getCompaniesRegex = /exports\.getCompanies = async \(req, res\) => \{[\s\S]*?\};/;

const newGetCompanies = `exports.getCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany();
    const branches = await prisma.branch.findMany();
    
    // Format branches to look like companies for frontend parity
    const formattedBranches = branches.map(b => ({
      ...b,
      name: b.branchName,
      isHeadOffice: false
    }));

    res.json([...companies, ...formattedBranches]);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Server error' });
  }
};`;

content = content.replace(getCompaniesRegex, newGetCompanies);

fs.writeFileSync('backend/src/controllers/companyController.js', content);
console.log('companyController.js getCompanies patched!');
