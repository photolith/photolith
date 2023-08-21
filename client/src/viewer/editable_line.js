import { fabric } from 'fabric';

function snapLine (originPoint, linePoint, newPoint, notBeyondDp = false) {
  // Treat originPoint as origin, get delta of linePoint & newPoint
  const lineDelta = linePoint.subtract(originPoint);
  const newDelta = newPoint.subtract(originPoint);
  const lineDist2 = Math.pow(lineDelta.x, 2) + Math.pow(lineDelta.y, 2);
  const newDist2 = Math.pow(newDelta.x, 2) + Math.pow(newDelta.y, 2);

  // Don't let newPoint go beyond (for mid-points), or behind linePoint (for end-points)
  if (notBeyondDp && newDist2 > lineDist2) return linePoint;
  if (!notBeyondDp && newDist2 < lineDist2) return linePoint;

  // Angle between lineDelta & newDelta
  const angleDelta = Math.atan2(lineDelta.y, lineDelta.x) - Math.atan2(newDelta.y, newDelta.x);

  // Angle shouldn't be obtuse (i.e. newPoint is "behind" originPoint)
  if (Math.abs(angleDelta) > Math.PI / 2 && Math.abs(angleDelta) < (Math.PI * 3 / 2)) return originPoint;

  // Rotate newDelta to cancel difference, add to originPoint
  const sinus = Math.sin(angleDelta); const cosinus = Math.cos(angleDelta);
  return originPoint.add(new fabric.Point(
    newDelta.x * cosinus - newDelta.y * sinus,
    newDelta.x * sinus + newDelta.y * cosinus
  ));
}

export default function (props = {}, circleProps = {}, endcapRadius) {
  props.strokeWidth = props.strokeWidth || 3;
  circleProps.strokeWidth = circleProps.strokeWidth || props.strokeWidth;
  circleProps.radius = circleProps.radius || 10;
  endcapRadius = endcapRadius || 3;

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
    this.set({
      left: newLimits.left,
      top: newLimits.top,
      width: newLimits.right - newLimits.left,
      height: newLimits.bottom - newLimits.top
    });
    this.setCoords(); // http://fabricjs.com/fabric-gotchas

    // Reposition nodes & polyline points
    const canvasToPoly = fabric.util.invertTransform(this.calcTransformMatrix());
    this.points = newPoints.map((p, i) => {
      this.phNodes[i].setPositionByOrigin(p, 'center', 'center');
      this.phNodes[i].phNodeIdx = i;
      this.phNodes[i].id = `${this.id}[${i}]`;

      return fabric.util.transformPoint(p, canvasToPoly);
    });

    // Make sure each phNode & line is scaled for current zoom level
    this.phNodes.forEach((obj, i) => {
      const endCap = i === 0 || i === (this.phNodes.length - 1);
      obj.strokeWidth = circleProps.strokeWidth / this.canvas.getZoom();
      obj.radius = (endCap ? endcapRadius : circleProps.radius) / this.canvas.getZoom();
      obj.width = obj.height = (obj.radius + obj.strokeWidth) * 2;
    });
    this.strokeWidth = props.strokeWidth / this.canvas.getZoom();

    if (this.canvas) {
      this.canvas.fire('object:modified', { target: this });
      this.canvas.requestRenderAll();
    }
  };

  // Helper to append point to existing list of nodes
  poly.phAddNode = function (newPoint, opt) {
    let i;
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Find first point that is further than the origin than our point, splice in new point here.
    for (i = 0; i < points.length; i++) {
      if (points[i].distanceFrom(points[0]) > newPoint.distanceFrom(points[0])) break;
    }
    if (opt.e.ctrlKey) {
      // ctrl held, no snapping to point
    } else if (i === points.length) {
      // Beyond end of line, use 2 previous points
      if (points.length > 1) newPoint = snapLine(points[points.length - 2], points[points.length - 1], newPoint, true);
    } else {
      newPoint = snapLine(points[i - 1], points[i], newPoint, true);
    }
    points.splice(i, 0, newPoint);

    poly.phSetPoints(points);
    this.canvas.setActiveObject(this.phNodes[i]);
  };

  // Update location of a moved node
  poly.phUpdateNode = function (phNode, opt) {
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Snap to line between siblings unless ctrl is held
    if (opt.e.ctrlKey) {
      // ctrl held, no snapping to point
    } else if (phNode.phNodeIdx === 0) {
      // Start: Snap to line formed by previous point
      if (points.length > 2) points[phNode.phNodeIdx] = snapLine(points[2], points[1], points[0]);
    } else if (phNode.phNodeIdx === points.length - 1) {
      // End: Snap to line formed by previous point
      if (points.length > 2) points[phNode.phNodeIdx] = snapLine(points[points.length - 3], points[points.length - 2], points[phNode.phNodeIdx]);
    } else {
      points[phNode.phNodeIdx] = points[phNode.phNodeIdx] = snapLine(points[phNode.phNodeIdx - 1], points[phNode.phNodeIdx + 1], points[phNode.phNodeIdx], true);
    }
    poly.phSetPoints(points);
  };

  // Remove pointer to phNode
  poly.phRemoveNode = function (phNode) {
    const points = this.phNodes.map((n) => new fabric.Point(n.left, n.top));

    // Deleting sole point would remove the line
    if (points.length < 2) return;

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
