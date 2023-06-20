import { fabric } from 'fabric';

export default function (props) {
  props.strokeWidth = props.strokeWidth || 3;
  props.radius = props.radius || 10;

  const poly = new fabric.Polyline([], Object.assign({}, {
    left: 0,
    top: 0,
    fill: 'transparent',
    stroke: 'rgba(50,255,255,0.6)',
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
    // Fill in any gaps in newPoints with absolute position of existing
    newPoints = newPoints.map((p, i) => {
      if (p === undefined) {
        return new fabric.Point(this.phNodes[i].left, this.phNodes[i].top);
      }
      if (p === null) {
        return null;
      }
      return p;
    }).filter((p, i) => {
      // Remove any nodes filtered with null
      if (p !== null) return true;
      this.canvas.remove(this.phNodes[i]);
      this.phNodes.splice(i, 1);
      return false;
    });
    if (newPoints.length === 0) return;

    // Add any missing phNodes
    while (this.phNodes.length < newPoints.length) {
      const idx = this.phNodes.length;
      const obj = new fabric.Circle({
        strokeWidth: props.strokeWidth,
        radius: props.radius,
        fill: 'transparent',
        stroke: 'rgba(50,255,255,1)',
        originX: 'center',
        originY: 'center',
        objectCaching: false // NB: So we can update obj.radius
      });
      // NB: We have to set position before canvas.add()
      obj.setPositionByOrigin(newPoints[idx], 'center', 'center');
      obj.hasControls = false;
      obj.phNodeIdx = idx;
      obj.on('moving', poly.phUpdateNode.bind(poly, obj));
      this.phNodes.push(obj);
      this.canvas.add(obj);
    }

    // Remove any extraneous phNodes
    while (this.phNodes.length > newPoints.length) {
      this.canvas.remove(this.phNodes.pop());
    }

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
  poly.phAddNode = function (newPoint) {
    const points = Array.apply(null, Array(poly.points.length));
    points.push(newPoint);
    return poly.phSetPoints(points);
  };

  // Update location of a moved node
  poly.phUpdateNode = function (phNode) {
    const points = Array.apply(null, Array(poly.points.length));
    points[this.phNodeIdx] = new fabric.Point(phNode.left, phNode.top);
    poly.phSetPoints(points);
  };

  // Remove pointer to phNode
  poly.phRemoveNode = function (phNode) {
    const points = Array.apply(null, Array(poly.points.length));

    if (phNode.phNodeIdx === undefined) return;

    points[phNode.phNodeIdx] = null;
    return poly.phSetPoints(points);
  };

  poly.on('moving', (event) => {
    // Refresh points based on their new position
    const points = Array.apply(null, Array((poly.points || []).length));
    poly.phSetPoints(points);
  });

  poly.on('phCanvasZoom', (event) => {
    // Refresh points to correct for any zoom error
    const points = Array.apply(null, Array((poly.points || []).length));
    poly.phSetPoints(points);
  });

  // Wait for a bit, zoom to init canvas
  window.setTimeout(() => {
    poly.fire('phCanvasZoom');
  }, 10);
  return poly;
}
