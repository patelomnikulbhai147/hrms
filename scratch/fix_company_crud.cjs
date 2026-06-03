const fs = require('fs');

let content = fs.readFileSync('backend/src/controllers/companyController.js', 'utf-8');

const createCompanyRegex = /exports\.createCompany = async \(req, res\) => \{[\s\S]*?\};/;
const newCreateCompany = `exports.createCompany = async (req, res) => {
  try {
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;
    
    if (isBranch) {
      const data = { ...req.body, branchName: req.body.name || req.body.branchName };
      delete data.name; // Prisma branch model uses branchName
      const branch = await prisma.branch.create({ data });
      return res.status(201).json({ ...branch, name: branch.branchName, isHeadOffice: false });
    }

    const company = await prisma.company.create({
      data: req.body
    });
    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company/branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};`;
content = content.replace(createCompanyRegex, newCreateCompany);

const updateCompanyRegex = /exports\.updateCompany = async \(req, res\) => \{[\s\S]*?\};/;
const newUpdateCompany = `exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const isBranch = req.body.isHeadOffice === false || req.body.parentCompanyId;

    if (isBranch) {
      const data = { ...req.body };
      if (data.name) {
        data.branchName = data.name;
        delete data.name;
      }
      const branch = await prisma.branch.update({
        where: { id },
        data
      });
      return res.json({ ...branch, name: branch.branchName, isHeadOffice: false });
    }

    const company = await prisma.company.update({
      where: { id },
      data: req.body
    });
    res.json(company);
  } catch (error) {
    console.error('Error updating company/branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};`;
content = content.replace(updateCompanyRegex, newUpdateCompany);

const deleteCompanyRegex = /exports\.deleteCompany = async \(req, res\) => \{[\s\S]*?\};/;
const newDeleteCompany = `exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Determine if it's a branch or company
    const branchCheck = await prisma.branch.findUnique({ where: { id } });
    if (branchCheck) {
      const branch = await prisma.branch.update({
        where: { id },
        data: { status: 'Archived' }
      });
      return res.json({ message: 'Branch archived successfully', company: { ...branch, name: branch.branchName } });
    }

    const company = await prisma.company.update({
      where: { id },
      data: { status: 'Archived' }
    });
    res.json({ message: 'Company archived successfully', company });
  } catch (error) {
    console.error('Error deleting company/branch:', error);
    res.status(500).json({ error: 'Server error' });
  }
};`;
content = content.replace(deleteCompanyRegex, newDeleteCompany);


fs.writeFileSync('backend/src/controllers/companyController.js', content);
console.log('companyController.js CRUD patched!');
