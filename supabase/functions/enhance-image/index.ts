import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

function validatePromptServerSide(prompt: string): { isValid: boolean; error?: string } {
  const normalizedPrompt = prompt.toLowerCase().trim();

  const negationPhrases = [
    'no ', 'not ', 'avoid ', 'without ', 'never ', 'don\'t ', 'do not ',
    'absolutely no', 'remove any', 'eliminating', 'excluding'
  ];

  const isInNegationContext = (keyword: string, text: string): boolean => {
    const keywordIndex = text.indexOf(keyword);
    if (keywordIndex === -1) return false;

    const precedingText = text.substring(Math.max(0, keywordIndex - 50), keywordIndex);

    return negationPhrases.some(phrase => precedingText.includes(phrase));
  };

  const prohibitedKeywords = [
    'shark', 'sharks', 'riding', 'dragon', 'dragons', 'unicorn', 'unicorns',
    'monster', 'monsters', 'alien', 'aliens', 'zombie', 'zombies',
    'vampire', 'vampires', 'werewolf', 'werewolves',
    'naked', 'nude', 'bikini', 'shirtless', 'topless', 'underwear',
    'celebrity', 'famous', 'movie star',
    'anime', 'cartoon', 'comic', 'superhero',
    'explosion', 'fire', 'weapon', 'gun', 'knife',
    'blood', 'gore', 'violent', 'death',
    'drugs', 'alcohol', 'smoking',
    'fantasy', 'magical', 'wizard', 'witch',
    'space', 'astronaut', 'planet',
    'underwater', 'diving', 'swimming with',
    'flying', 'floating', 'levitating',
    'motorcycle', 'vehicle', 'driving',
    'military', 'soldier', 'combat',
  ];

  const contextualKeywords = ['sexy', 'seductive', 'provocative', 'sultry'];

  for (const keyword of prohibitedKeywords) {
    if (normalizedPrompt.includes(keyword)) {
      return {
        isValid: false,
        error: 'Your prompt contains inappropriate content for professional profile photos. Please focus on lighting, background, and clothing only.',
      };
    }
  }

  for (const keyword of contextualKeywords) {
    if (normalizedPrompt.includes(keyword) && !isInNegationContext(keyword, normalizedPrompt)) {
      return {
        isValid: false,
        error: 'Your prompt contains inappropriate content for professional profile photos. Please focus on lighting, background, and clothing only.',
      };
    }
  }

  return { isValid: true };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = '';
  const chunkSize = 8192;
  
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File;
    const prompt = formData.get("prompt") as string;
    const needsPersonRemoval = formData.get("needs_person_removal") === "true";

    if (!imageFile || !prompt) {
      return new Response(
        JSON.stringify({ error: "Missing image or prompt" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const promptValidation = validatePromptServerSide(prompt);
    if (!promptValidation.isValid) {
      return new Response(
        JSON.stringify({ error: promptValidation.error }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const imageBytes = await imageFile.arrayBuffer();
    const base64Image = arrayBufferToBase64(imageBytes);

    let enhancementPrompt = prompt;

    if (needsPersonRemoval) {
      enhancementPrompt = `First, carefully identify and remove any additional people from this photo, keeping ONLY the main primary subject person. Fill in the removed areas naturally with appropriate background that matches the scene. Then apply these enhancements: ${prompt}. The main subject's face, features, and appearance must remain completely unchanged - only remove other people and enhance the photo quality, lighting, and composition.`;
    }

    const requestBody = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: imageFile.type || "image/jpeg",
              data: base64Image
            }
          },
          {
            text: enhancementPrompt
          }
        ]
      }],
      generationConfig: {
        responseModalities: ["Image"],
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return new Response(
        JSON.stringify({ 
          error: `API request failed: ${response.status}`,
          details: errorText 
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const result = await response.json();
    console.log("Full API Response:", JSON.stringify(result, null, 2));

    if (result.candidates && result.candidates[0]?.content?.parts) {
      const parts = result.candidates[0].content.parts;
      
      for (const part of parts) {
        if (part.inlineData?.data) {
          return new Response(
            JSON.stringify({ 
              enhanced_image_url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        if (part.inline_data?.data) {
          return new Response(
            JSON.stringify({ 
              enhanced_image_url: `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`
            }),
            {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        error: "No image generated in response. The API returned a response but no image data was found.",
        apiResponse: result
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
