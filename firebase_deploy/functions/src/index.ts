import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { GoogleGenAI, Type, Schema } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

// Note : La clé API sera lue depuis les secrets de configuration Firebase
const ai = new GoogleGenAI();

const predictionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    scenario: { type: Type.STRING },
    probabilities: {
      type: Type.OBJECT,
      properties: {
        homeWin: { type: Type.NUMBER },
        draw: { type: Type.NUMBER },
        awayWin: { type: Type.NUMBER },
        over25Goals: { type: Type.NUMBER },
      },
      required: ["homeWin", "draw", "awayWin", "over25Goals"],
    },
    cornersTrend: { type: Type.STRING },
    confidenceIndex: { type: Type.INTEGER }
  },
  required: ["scenario", "probabilities", "cornersTrend", "confidenceIndex"],
};

export const generateMatchAnalysis = onRequest({ cors: true }, async (req, res) => {
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
    const prompt = `Analyse tactique pour ${matchData?.homeTeam} vs ${matchData?.awayTeam}. Format JSON strict requis.`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: predictionSchema,
        temperature: 0.2,
      }
    });

    const analysisJson = JSON.parse(response.text);

    await db.collection("matches").doc(matchId).update({
      aiAnalysis: analysisJson,
      status: "analysed"
    });

    res.status(200).send({ success: true, analysis: analysisJson });

  } catch (error: any) {
    res.status(500).send({ success: false, error: error.message });
  }
});
