const templateService = require('../services/templateService');

exports.createTemplate = async (req, res) => {
  try {
    const { companyId } = req.user || req.body;
    const userId = req.user ? req.user.id : null;
    const data = { ...req.body, companyId, createdBy: userId };
    
    const template = await templateService.createTemplate(data);
    res.status(201).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;
    
    const template = await templateService.updateTemplate(id, req.body, userId);
    res.status(200).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const { companyId } = req.user || req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID required' });
    
    const templates = await templateService.getTemplates(companyId, req.query);
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await templateService.getTemplateById(id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    
    res.status(200).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.assignTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { companyId } = req.user || req.body;
    const { targetType, targetId } = req.body;
    const userId = req.user ? req.user.id : null;
    
    const assignment = await templateService.assignTemplate(templateId, companyId, targetType, targetId, userId);
    res.status(200).json({ success: true, assignment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.removeAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    await templateService.removeAssignment(assignmentId);
    res.status(200).json({ success: true, message: 'Assignment removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.restoreVersion = async (req, res) => {
  try {
    const { templateId, versionId } = req.params;
    const userId = req.user ? req.user.id : null;
    
    const template = await templateService.restoreVersion(templateId, versionId, userId);
    res.status(200).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getMarketplaceTemplates = async (req, res) => {
  try {
    const templates = await templateService.getMarketplaceTemplates();
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.duplicateTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { targetCompanyId } = req.body;
    const userId = req.user ? req.user.id : null;
    
    const template = await templateService.duplicateTemplate(templateId, targetCompanyId, userId);
    res.status(201).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.exportTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await templateService.getTemplateById(id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    
    // Create a clean version for export (removing IDs and company-specific data)
    const exportData = {
      name: template.name,
      type: template.type,
      designType: template.designType,
      content: template.content,
      backgroundImage: template.backgroundImage,
      description: template.description
    };
    
    res.status(200).json({ success: true, exportData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.importTemplate = async (req, res) => {
  try {
    const { companyId } = req.user || req.body;
    const userId = req.user ? req.user.id : null;
    const { exportData } = req.body;
    
    if (!exportData || !exportData.name) {
      return res.status(400).json({ success: false, message: 'Invalid export data' });
    }
    
    const data = {
      ...exportData,
      companyId,
      createdBy: userId,
      status: 'Draft',
      isGlobal: false
    };
    
    const template = await templateService.createTemplate(data);
    res.status(201).json({ success: true, template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.generateTemplateFromAI = async (req, res) => {
  try {
    const { prompt, type } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ success: false, message: 'AI Assistant is not configured on this server.' });
    }

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `You are an expert HTML email and document template designer.
Generate a valid HTML snippet for a document of type: ${type || 'Document'}.
The user requirement is: ${prompt}
Use Handlebars syntax {{variable_name}} for dynamic data. 
Use inline CSS. 
DO NOT include full <html> tags, just the content that can be injected into a <body>.
DO NOT wrap the response in markdown code blocks (\`\`\`). Just return the raw HTML string.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the template." }
      ],
      temperature: 0.7,
    });

    const generatedHtml = response.choices[0].message.content.trim();
    
    res.status(200).json({ success: true, html: generatedHtml });
  } catch (error) {
    console.error('AI Generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate template via AI.' });
  }
};
