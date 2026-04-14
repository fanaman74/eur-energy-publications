// Vercel serverless function — generates an AI summary for publications
// that have no machine-readable abstract in CELLAR.
import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { title, date, type, subjects, agents } = req.body || {}
    if (!title) {
      res.status(400).json({ error: 'title is required' })
      return
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a concise 2-3 sentence factual summary for this EU energy publication based on its metadata. Do not include disclaimers or say you are summarizing from metadata — just write the summary directly.

Title: ${title}
Type: ${type || 'Publication'}
Date: ${date || 'Unknown'}
Subject areas: ${Array.isArray(subjects) ? subjects.join(', ') : (subjects || 'Energy policy')}
Issuing body: ${Array.isArray(agents) ? agents.join(', ') : (agents || 'European Commission')}`,
        },
      ],
    })

    res.status(200).json({ summary: message.content[0].text })
  } catch (e) {
    res.status(500).json({ error: 'Summary generation failed', detail: String(e) })
  }
}
