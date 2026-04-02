import type { ModelDetail } from "@paperclipai/plugin-sdk";

export const OPENCODE_MODELS: Record<string, ModelDetail> = {
  "big-pickle": {
    id: "big-pickle",
    name: "Big Pickle",
    provider: "opencode",
    description: "The classic OpenCode model.",
    capabilities: ["text"],
  },
  "gpt-5-nano": {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    provider: "opencode",
    description: "A small but capable model.",
    capabilities: ["text"],
  },
  "mimo-v2-omni-free": {
    id: "mimo-v2-omni-free",
    name: "Mimo v2 Omni (Free)",
    provider: "opencode",
    description: "Fast and versatile multimodal model.",
    capabilities: ["text", "vision"],
  },
  "mimo-v2-pro-free": {
    id: "mimo-v2-pro-free",
    name: "Mimo v2 Pro (Free)",
    provider: "opencode",
    description: "Our most capable free model.",
    capabilities: ["text", "vision"],
  },
  "minimax-m2.5-free": {
    id: "minimax-m2.5-free",
    name: "MiniMax M2.5 (Free)",
    provider: "opencode",
    description: "Highly intelligent model from MiniMax.",
    capabilities: ["text"],
  },
  "minimax-m2.7": {
    id: "minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "opencode",
    description: "Advanced model from MiniMax via OpenRouter.",
    capabilities: ["text"],
  },
  "nemotron-3-super-free": {
    id: "nemotron-3-super-free",
    name: "Nemotron-3 Super (Free)",
    provider: "opencode",
    description: "Powerful language model from NVIDIA.",
    capabilities: ["text"],
  },
  "qwen3.6-plus-free": {
    id: "qwen3.6-plus-free",
    name: "Qwen 3.6 Plus (Free)",
    provider: "opencode",
    description: "Large language model from Alibaba.",
    capabilities: ["text"],
  },
};
