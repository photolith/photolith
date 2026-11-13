import test from 'tape';
import { ActiveSelection, Point, util } from 'fabric';

import { setupDom } from './util_dom.js';

import editableLine from '../src/viewer/editable_line.js';

function setupLine (test, points) {
  setupDom(test);
  // Minimal stand-in for the parts of a fabric Canvas editable_line uses
  const canvas = {
    add (o) { o.canvas = this; },
    remove (o) { o.canvas = undefined; },
    getZoom: () => 1,
    fire () {},
    requestRenderAll () {},
    setActiveObject () {},
    phPrefs: {}
  };
  const poly = editableLine();
  canvas.add(poly);
  poly.phSetPoints(points.map((p) => new Point(p[0], p[1])));
  return poly;
}

/** Canvas position of each node, rounded */
function nodePositions (poly) {
  return poly.phNodes.map((n) => {
    const p = n.group ? util.transformPoint(new Point(n.left, n.top), n.group.calcTransformMatrix()) : new Point(n.left, n.top);
    return [Math.round(p.x), Math.round(p.y)];
  });
}

test('editableLine:grouped nodes', function (test) {
  const poly = setupLine(test, [[10, 10], [50, 10], [100, 10]]);

  // Select last 2 nodes & drag the selection 20px right
  const sel = new ActiveSelection(poly.phNodes.slice(1));
  sel.set({ left: sel.left + 20 });
  sel.setCoords();
  test.deepEqual(nodePositions(poly), [[10, 10], [70, 10], [120, 10]], 'Nodes moved with selection');

  poly.fire('phCanvasZoom');
  test.deepEqual(nodePositions(poly), [[10, 10], [70, 10], [120, 10]], 'Zooming leaves selected nodes where they are');
  test.deepEqual(poly.points.map((p) => {
    p = util.transformPoint(p, poly.calcTransformMatrix());
    return [Math.round(p.x), Math.round(p.y)];
  }), [[10, 10], [70, 10], [120, 10]], 'Line follows nodes');

  poly.fire('moving');
  test.deepEqual(nodePositions(poly), [[10, 10], [70, 10], [120, 10]], 'Moving line leaves selected nodes where they are');

  poly.phRemoveNode(poly.phNodes[1]);
  test.deepEqual(nodePositions(poly), [[10, 10], [120, 10]], 'Removing a grouped node keeps the others in place');

  test.end();
});
