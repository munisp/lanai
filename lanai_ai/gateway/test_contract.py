import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ["AI_GATEWAY_TOKEN"] = "test-token"
os.environ["OLLAMA_MODEL"] = "qwen2.5:3b"
sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient
import app as gateway


class FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"response": "A real local-model response.", "done_reason": "stop"}


class GatewayContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(gateway.app)
        self.payload = {
            "capability": "proposal",
            "prompt": "Create a proposal from supplied facts.",
            "system": "Use supplied facts only.",
        }

    def test_requires_service_token(self):
        response = self.client.post("/infer", json=self.payload)
        self.assertEqual(response.status_code, 401)

    def test_returns_runtime_completion(self):
        with patch.object(gateway.requests, "post", return_value=FakeResponse()) as post:
            response = self.client.post("/infer", headers={"Authorization": "Bearer test-token"}, json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["output"], "A real local-model response.")
        self.assertEqual(response.json()["model"], "qwen2.5:3b")
        self.assertEqual(post.call_args.kwargs["json"]["options"]["num_thread"], gateway.OLLAMA_NUM_THREADS)

    def test_returns_unavailable_when_runtime_cannot_be_reached(self):
        with patch.object(gateway.requests, "post", side_effect=gateway.requests.RequestException("connection refused")):
            response = self.client.post("/infer", headers={"Authorization": "Bearer test-token"}, json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertIn("unavailable", response.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
