// Ported from ricos.site 3D dungeon generator (GraphStructures.ts).

import { Vector3 } from "./types";

export class Vertex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(public position: Vector3, public data: any = null) {}

  equals(other: Vertex): boolean {
    return (
      this.position.x === other.position.x &&
      this.position.y === other.position.y &&
      this.position.z === other.position.z
    );
  }

  getHashCode(): number {
    return (
      ((this.position.x * 73856093) ^
        (this.position.y * 19349663) ^
        (this.position.z * 83492791)) |
      0
    );
  }

  static almostEqual(a: Vertex, b: Vertex): boolean {
    const epsilon = 0.01;
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const dz = a.position.z - b.position.z;
    return (
      Math.abs(dx) < epsilon && Math.abs(dy) < epsilon && Math.abs(dz) < epsilon
    );
  }
}

export class VertexWithData<T> extends Vertex {
  constructor(position: Vector3, public item: T) {
    super(position, item);
  }
}

export class Edge {
  constructor(public u: Vertex, public v: Vertex) {}

  get distance(): number {
    return this.u.position.distance(this.v.position);
  }

  equals(other: Edge): boolean {
    return (
      (this.u.equals(other.u) && this.v.equals(other.v)) ||
      (this.u.equals(other.v) && this.v.equals(other.u))
    );
  }

  static almostEqual(a: Edge, b: Edge): boolean {
    return (
      (Vertex.almostEqual(a.u, b.u) && Vertex.almostEqual(a.v, b.v)) ||
      (Vertex.almostEqual(a.u, b.v) && Vertex.almostEqual(a.v, b.u))
    );
  }

  getHashCode(): number {
    return this.u.getHashCode() ^ this.v.getHashCode();
  }
}

export class DelaunayEdge extends Edge {
  public isBad: boolean = false;

  constructor(u: Vertex, v: Vertex) {
    super(u, v);
  }
}

export class Triangle {
  public isBad: boolean = false;

  constructor(public u: Vertex, public v: Vertex, public w: Vertex) {}

  containsVertex(vertex: Vertex): boolean {
    return (
      Vertex.almostEqual(vertex, this.u) ||
      Vertex.almostEqual(vertex, this.v) ||
      Vertex.almostEqual(vertex, this.w)
    );
  }

  equals(other: Triangle): boolean {
    return (
      (this.u.equals(other.u) ||
        this.u.equals(other.v) ||
        this.u.equals(other.w)) &&
      (this.v.equals(other.u) ||
        this.v.equals(other.v) ||
        this.v.equals(other.w)) &&
      (this.w.equals(other.u) ||
        this.w.equals(other.v) ||
        this.w.equals(other.w))
    );
  }

  static almostEqual(a: Triangle, b: Triangle): boolean {
    return (
      (Vertex.almostEqual(a.u, b.u) ||
        Vertex.almostEqual(a.u, b.v) ||
        Vertex.almostEqual(a.u, b.w)) &&
      (Vertex.almostEqual(a.v, b.u) ||
        Vertex.almostEqual(a.v, b.v) ||
        Vertex.almostEqual(a.v, b.w)) &&
      (Vertex.almostEqual(a.w, b.u) ||
        Vertex.almostEqual(a.w, b.v) ||
        Vertex.almostEqual(a.w, b.w))
    );
  }

  getHashCode(): number {
    return this.u.getHashCode() ^ this.v.getHashCode() ^ this.w.getHashCode();
  }
}
