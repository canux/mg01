// 轻量 2D 向量 (x=横向, y=纵向前进方向)
// Unity 迁移：直接用 UnityEngine.Vector2

export class Vec2 {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  static zero(): Vec2 { return new Vec2(0, 0); }

  clone(): Vec2 { return new Vec2(this.x, this.y); }

  add(o: Vec2): Vec2 { return new Vec2(this.x + o.x, this.y + o.y); }
  sub(o: Vec2): Vec2 { return new Vec2(this.x - o.x, this.y - o.y); }
  mul(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }

  lenSq(): number { return this.x * this.x + this.y * this.y; }
  len(): number { return Math.sqrt(this.lenSq()); }

  normalize(): Vec2 {
    const l = this.len();
    return l > 1e-6 ? new Vec2(this.x / l, this.y / l) : Vec2.zero();
  }

  static distance(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static distanceSq(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }
}
