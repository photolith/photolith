import { fabric } from 'fabric';

// Return point between (p1) & (p2) that's closest to (newPoint)
function betweenPoints (p1, p2, newPoint) {
  // One of the points undefined probably means we fell of either end when iterating
  if (p1 === undefined || p2 === undefined) return newPoint;

  if (p1.distanceFrom(p2) / newPoint.distanceFrom(p2) < 1) {
    // Try p2 -> p1 first, don't go beyond p1
    return p1;
  }
  // Find point along line between p1 & p2 that is same ratio of distances as given point
  return p1.lerp(p2, Math.min(newPoint.distanceFrom(p1) / p2.distanceFrom(p1), 1));
}

export default function (props, circleProps) {
  props.strokeWidth = props.strokeWidth || 3;
  props.radius = props.radius || 10;

  const poly = new fabric.Polyline([], Object.assign({}, {
    left: 0,
    top: 0,
    fill: 'transparent',
    stroke: 'orangered',
    objectCaching: false, // NB: Otherwise updating points array doesn't work
    selectable: false,
    evented: false // NB: Without, the poly's area still allows you to drag-select
  }, props));
  poly.cornerStyle = 'circle';
  poly.cornerColor = 'rgba(0,0,255,0.5)';

  // Make sure our pathOffset is zero so we don't have to account for it in phSetPoints()
  poly.pathOffset = new fabric.Point(0, 0);

  // Array to store "sub-objects" acting as control handles
  poly.phNodes = [];

  poly.phSetPoints = function (newPoints) {
    // Add any missing phNodes
    while (this.phNodes.length < newPoints.length) {
      const idx = this.phNodes.length;
      const obj = new fabric.Circle(Object.assign({}, {
        strokeWidth: props.strokeWidth,
        radius: props.radius,
        fill: 'transparent',
        stroke: 'orangered',
        originX: 'center',
        originY: 'center',
        objectCaching: false // NB: So we can update obj.radius
      }, circleProps));
      // NB: We have to set position before canvas.add()
      obj.setPositionByOrigin(newPoints[idx], 'center', 'center');
      obj.hasControls = false;
      obj.on('moving', poly.phUpdateNode.bind(poly, obj));
      this.phNodes.push(obj);
      this.canvas.add(obj);
    }

    // Remove any extraneous phNodes
    while (this.phNodes.length > newPoints.length) {
      this.canvas.remove(this.phNodes.pop());
    }
    if (this.phNodes.length === 0) return;

    // Work out new limits of polyline
    const newLimits = newPoints.reduce((acc, p) => {
      return !acc
        ? { left: p.x, top: p.y, right: p.x, bottom: p.y }
        : {
            left: Math.min(acc.left, p.x),
            top: Math.min(acc.top, p.y),
            right: Math.max(acc.right, p.x),
            bottom: Math.max(acc.bottom, p.y)
          };
    }, null);
    this.left = newLimits.left;
    this.top = newLimits.top;
    this.width = newLimits.right - newLimits.left;
    this.height = newLimits.bottom - newLimits.top;

    // Reposition nodes & polyline points
    const canvasToPoly = fabric.util.invertTransform(this.calcTransformMatrix());
    this.points = newPoints.map((p, i) => {
      this.phNodes[i].setPositionByOrigin(p, 'center', 'center');
      this.phNodes[i].phNodeIdx = i;

      return fabric.util.transformPoint(p, canvasToPoly);
    });

    // Make sure each phNode & line is scaled for current zoom level
    this.phNodes.forEach((obj) => {
      obj.strokeWidth = props.strokeWidth / this.canvas.getZoom();
      obj.radius = props.radius / this.canvas.getZoom();
      obj.width = ((props.radius + props.strokeWidth) * 2) / this.canvas.getZoom();
      obj.height = ((props.radius + props.strokeWidth) * 2) / this.canvas.getZoom();
    });
    this.strokeWidth = props.strokeWidth / this.canvas.getZoom();

    if (this.canvas) this.canvas.requestRenderAll();
  };

  // Helper to append point to existing list of nodes
  poly.phAddNode = function (newPoint, opt) {
    let i;
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Find first point that is further than the origin than our point, splice in new point here.
    for (i = 0; i < points.length; i++) {
      if (points[i].distanceFrom(points[0]) > newPoint.distanceFrom(points[0])) break;
    }
    points.splice(i, 0, opt.e.ctrlKey ? newPoint : betweenPoints(points[i - 1], points[i], newPoint));

    poly.phSetPoints(points);
    this.canvas.setActiveObject(this.phNodes[i]);
  };

  // Update location of a moved node
  poly.phUpdateNode = function (phNode, opt) {
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Snap to line between siblings unless ctrl is held
    if (!opt.e.ctrlKey) points[phNode.phNodeIdx] = betweenPoints(points[phNode.phNodeIdx - 1], points[phNode.phNodeIdx + 1], points[phNode.phNodeIdx]);
    poly.phSetPoints(points);
  };

  // Remove pointer to phNode
  poly.phRemoveNode = function (phNode) {
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Remove point at given index
    points.splice(phNode.phNodeIdx, 1);

    poly.phSetPoints(points);
    this.canvas.setActiveObject(this.phNodes[phNode.phNodeIdx - 1]);
  };

  poly.on('moving', (event) => {
    // Refresh points based on their new position
    const points = poly.phNodes.map((n) => new fabric.Point(n.left, n.top));
    return poly.phSetPoints(points);
  });

  poly.on('phCanvasZoom', (event) => {
    // Refresh points to correct for any zoom error
    const points = poly.phNodes.map((n) => new fabric.Point(n.left, n.top));
    return poly.phSetPoints(points);
  });

  // Wait for a bit, zoom to init canvas
  window.setTimeout(() => {
    poly.fire('phCanvasZoom');
  }, 10);
  return poly;
}
