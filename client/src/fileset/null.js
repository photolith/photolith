export class NullFileSet {
  constructor () {
    this.name = 'null:';
  }

  next () {
    return Promise.resolve({ f: null, remaining: 0 });
  }

  close () { }
}
