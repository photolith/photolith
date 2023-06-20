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
    selectable: false
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
      const obj = new fabric.Circle({
        strokeWidth: props.strokeWidth,
        radius: props.radius,
        fill: 'transparent',
        stroke: 'rgba(50,255,255,1)',
        originX: 'center',
        originY: 'center',
        objectCaching: false // NB: So we can update obj.radius
      });
      obj.hasControls = false;
      obj.on('moving', (event) => {
        const points = Array.apply(null, Array(poly.points.length));
        points[idx] = new fabric.Point(obj.left, obj.top);
        poly.phSetPoints(points);
      });
      this.phNodes.push(obj);
      this.canvas.add(obj);
    }

    // Remove any extraneous phNodes
    while (this.phNodes.length > newPoints.length) {
      this.canvas.remove(this.phNodes.pop());
    }

    // Make sure each phNode & line is scaled for current zoom level
    this.phNodes.forEach((obj) => {
      obj.strokeWidth = props.strokeWidth / this.canvas.getZoom();
      obj.radius = props.radius / this.canvas.getZoom();
      obj.width = ((props.radius + props.strokeWidth) * 2) / this.canvas.getZoom();
      obj.height = ((props.radius + props.strokeWidth) * 2) / this.canvas.getZoom();
    });
    this.strokeWidth = props.strokeWidth / this.canvas.getZoom();

    // Fill in any gaps in newPoints with absolute position of existing
    newPoints = newPoints.map((p, i) => {
      return p === undefined ? new fabric.Point(this.phNodes[i].left, this.phNodes[i].top) : newPoints[i];
    });
    if (newPoints.length === 0) return;

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
    if (this.canvas) this.canvas.requestRenderAll();
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
