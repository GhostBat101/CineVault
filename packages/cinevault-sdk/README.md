# `@ghostbat101/cinevault-sdk`

> Reusable TypeScript toolkit for narrative design, screenplay beat sheet structuring (Save the Cat! / Three-Act), character tension calculus, and Model Context Protocol (MCP) narrative auditing tools.

---

## 📦 Installation

```bash
# Via GitHub Packages npm registry
npm install @ghostbat101/cinevault-sdk
```

---

## 🚀 Quickstart

```typescript
import { BeatSheetEngine, CharacterTensionMatrix } from '@ghostbat101/cinevault-sdk';

// 1. Structure a screenplay with Save the Cat! framework
const engine = new BeatSheetEngine('save-the-cat');
engine.setBeatContent('Opening Image', 'Protagonist in rainy city...');
engine.setBeatContent('Catalyst', 'A secret envelope arrives...');

// 2. Track dynamic character tension
const matrix = new CharacterTensionMatrix();
matrix.setRelationship({
  sourceId: 'hero',
  targetId: 'rival',
  relationType: 'betrayal',
  tensionScore: 9,
  notes: 'Former allies separated by blood feud'
});

console.log('Average Tension:', matrix.calculateAverageTension());
```

---

## 📄 License
MIT License - Open for developers, toolsmiths, and narrative researchers.
