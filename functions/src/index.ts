import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

admin.initializeApp();
const db = admin.firestore();

// Initialisation avec la clé API (à configurer dans Firebase)
// firebase functions:secrets:set GEMINI_API_KEY=VOTRE_CLE
const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export const generateMatchAnalysis = onRequest({ cors: true, secrets: ["GEMINI_API_KEY"] }, async (req, res) => {
  try {
    const { matchId } = req.body;
    if (!matchId) {
      res.status(400).send({ error: "matchId requis" });
      return;
    }

    const matchDoc = await db.collection("matches").doc(matchId).get();
    if (!matchDoc.exists) {
      res.status(404).send({ error: "Match introuvable" });
      return;
    }

    const matchData = matchDoc.data();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Analyse tactique pour ${matchData?.homeTeam} vs ${matchData?.awayTeam}.
    Donne un score probable, les probabilités (Victoire Dom, Nul, Ext) et une tendance corners.
    Réponds EXCLUSIVEMENT au format JSON.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Nettoyage du texte pour extraire le JSON
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const analysisJson = JSON.parse(jsonStr);

    await db.collection("matches").doc(matchId).update({
      aiAnalysis: analysisJson,
      status: "analysed"
    });

    res.status(200).send({ success: true, analysis: analysisJson });

  } catch (error: any) {
    console.error("Erreur IA:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});
