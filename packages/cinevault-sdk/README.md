# 🎬 CineVault Developer SDK (`@ghostbat101/cinevault-sdk`)

A standalone TypeScript library for screenwriters, game designers, and AI application developers to calculate narrative beat structures, character tension graphs, and Model Context Protocol (MCP) tooling.

---

## 📦 Installation

Published to GitHub Packages:

```bash
npm install @ghostbat101/cinevault-sdk
```

---

## 🚀 Quick Start Examples

### 1. Calculate Save the Cat! 15 Beat Timestamps

```typescript
import { BeatSheetEngine } from '@ghostbat101/cinevault-sdk';

// Initialize with Save the Cat! framework
const engine = new BeatSheetEngine('save-the-cat');

// Calculate target page/minute timestamps for a 120-minute feature film
const timeline = engine.calculateTimestamps(120);

console.log(timeline);
// [
//   { name: 'Opening Image', targetMinute: 1, targetPage: 1, isCompleted: false },
//   { name: 'Catalyst', targetMinute: 14, targetPage: 14, isCompleted: false },
//   { name: 'Midpoint', targetMinute: 60, targetPage: 57, isCompleted: false },
//   { name: 'All Is Lost', targetMinute: 90, targetPage: 86, isCompleted: false },
//   ...
// ]
```

### 2. Character Dynamic Tension Matrix & Friction Index

```typescript
import { CharacterTensionEngine } from '@ghostbat101/cinevault-sdk';

const matrix = new CharacterTensionEngine();

matrix.addCharacter({ id: 'c1', name: 'Dominic Cobb', roleType: 'protagonist' });
matrix.addCharacter({ id: 'c2', name: 'Mal Cobb', roleType: 'antagonist' });
matrix.addCharacter({ id: 'c3', name: 'Ariadne', roleType: 'deuteragonist' });

matrix.setRelationship({
  sourceCharacterId: 'c1',
  targetCharacterId: 'c2',
  relationshipType: 'Tragic Lovers / Projection',
  tensionScore: 10,
});

matrix.setRelationship({
  sourceCharacterId: 'c1',
  targetCharacterId: 'c3',
  relationshipType: 'Mentor / Subconscious Anchor',
  tensionScore: 4,
});

// Calculate statistical tension metrics
const summary = matrix.calculateTensionSummary();
console.log(summary);
// {
//   averageTensionScore: 7.0,
//   highestTensionPair: { char1: 'Dominic Cobb', char2: 'Mal Cobb', score: 10, dynamic: '...' },
//   totalRelationshipLinks: 2
// }
```

### 3. Model Context Protocol (MCP) Tool Integration

```typescript
import { CINEVAULT_MCP_TOOLS } from '@ghostbat101/cinevault-sdk';

// Register standard tools in your MCP server
console.log(CINEVAULT_MCP_TOOLS);
```

---

## 📄 License

MIT Open Source License.
