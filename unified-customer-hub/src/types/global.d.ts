// ═══════════════════════════════════════════════════════════════════════════════
// Global Type Declarations
// ═══════════════════════════════════════════════════════════════════════════════

declare global {
  // BigInt serialization for JSON
  interface BigInt {
    toJSON(): string;
  }
}

// Enable BigInt serialization
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export {};
