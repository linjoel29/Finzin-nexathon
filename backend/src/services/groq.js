// groq.js - Groq AI coach service export
const geminiService = require('./gemini');

module.exports = {
  createGroqService: geminiService.createGroqService,
  createGeminiService: geminiService.createGeminiService,
  adviceResponseSchema: geminiService.adviceResponseSchema,
  geminiResponseSchema: geminiService.geminiResponseSchema,
  sanitizeText: geminiService.sanitizeText,
};
