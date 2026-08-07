"""
QUAERO × MiroFish Integration
Swarm intelligence prediction layer — 500+ agents debate the topic,
producing consensus predictions and controversy maps.
"""
import asyncio
import httpx
from loguru import logger
from core.config import settings


class MiroFishClient:
    def __init__(self):
        self.base_url = settings.MIROFISH_URL
        self.client = httpx.AsyncClient(timeout=60.0)
        self.enabled = settings.MIROFISH_ENABLED

    async def predict(self, query: str, context: str) -> dict:
        """
        Feed query + search context to MiroFish.
        Returns swarm consensus prediction + controversy map.
        """
        if not self.enabled:
            return {"enabled": False}

        try:
            resp = await self.client.post(
                f"{self.base_url}/simulate",
                json={
                    "scenario": f"Question: {query}\n\nBackground:\n{context}",
                    "num_agents": settings.MIROFISH_AGENTS,
                    "output_format": "prediction_report",
                    "agent_diversity": "high",   # diverse personalities = better predictions
                    "rounds": 5,                 # 5 rounds of debate
                },
            )
            data = resp.json()
            return {
                "enabled": True,
                "consensus": data.get("consensus", ""),
                "confidence": data.get("confidence_pct", 0),
                "controversy_score": data.get("controversy_score", 0),
                "agent_split": data.get("agent_split", {}),      # % agents per viewpoint
                "top_viewpoints": data.get("top_viewpoints", []),
                "prediction": data.get("prediction", ""),
            }
        except httpx.ConnectError:
            logger.info("MiroFish not running — skipping prediction layer")
            return {"enabled": False, "reason": "MiroFish service not running"}
        except Exception as e:
            logger.warning(f"MiroFish error: {e}")
            return {"enabled": False, "reason": str(e)}

    async def detect_misinformation(self, content: str) -> dict:
        """
        Simulate how content would spread through a social network.
        Misinformation spreads differently from credible content.
        """
        if not self.enabled:
            return {"enabled": False}

        try:
            resp = await self.client.post(
                f"{self.base_url}/simulate",
                json={
                    "scenario": content,
                    "mode": "misinformation_detection",
                    "num_agents": 200,
                    "rounds": 3,
                },
            )
            data = resp.json()
            return {
                "enabled": True,
                "credibility_score": data.get("credibility_score", 0.5),
                "spread_pattern": data.get("spread_pattern", ""),
                "flags": data.get("flags", []),
            }
        except Exception as e:
            logger.warning(f"MiroFish misinformation check failed: {e}")
            return {"enabled": False}

    async def close(self):
        await self.client.aclose()
