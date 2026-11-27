import { Circle, Point, Polyline, util } from 'fabric';

const labelFontSize = 10; // NB: In screen pixels, scaled by zoom as strokeWidth
const labelPadding = 2;
let labelMeasureCtx;

/** New Point at (x, y), with an optional (label), e.g. an [x, y, label] axis_poly entry */
export function labelledPoint (x, y, label) {
  const out = new Point(x, y);
  if (label !== undefined && label !== null) out.phLabel = label;
  return out;
}

/** Circle with phLabel (if any, and phShowLabel) drawn inside it, as part of the circle */
class LabelledCircle extends Circle {
  _render (ctx) {
    super._render(ctx);
    if (!this.phShowLabel || this.phLabel === undefined) return;

    ctx.save();
    ctx.font = `${this.phLabelFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // NB: Dark text for contrast, the circle's stroke still shows the line's colour
    ctx.fillStyle = 'rgb(33, 37, 41)';
    ctx.fillText(this.phLabel, 0, 0);
    ctx.restore();
  }
}

/** Radius (in screen pixels) a circle needs to contain (label) */
function labelRadius (label) {
  if (!labelMeasureCtx) labelMeasureCtx = document.createElement('canvas').getContext('2d');
  labelMeasureCtx.font = `${labelFontSize}px sans-serif`;
  const width = labelMeasureCtx.measureText(label).width;
  return Math.sqrt(Math.pow(width / 2, 2) + Math.pow(labelFontSize / 2, 2)) + labelPadding;
}

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
  return originPoint.add(new Point(
    newDelta.x * cosinus - newDelta.y * sinus,
    newDelta.x * sinus + newDelta.y * cosinus
  ));
}

/** Canvas position of (node), which could be within a group (e.g. ActiveSelection), with the node's label */
function nodePoint (n) {
  const p = n.group ? util.transformPoint(new Point(n.left, n.top), n.group.calcTransformMatrix()) : new Point(n.left, n.top);
  return labelledPoint(p.x, p.y, n.phLabel);
}

export default function (props = {}, circleProps = {}, opts = {}) {
  props.strokeWidth = props.strokeWidth || 3;
  circleProps.strokeWidth = circleProps.strokeWidth || props.strokeWidth;
  circleProps.radius = circleProps.radius || 10;
  const endcapRadius = 3;

  const poly = new Polyline([], Object.assign({}, {
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
  poly.pathOffset = new Point(0, 0);

  // Array to store "sub-objects" acting as control handles
  poly.phNodes = [];

  poly.phSetPoints = function (newPoints, suppressChange) {
    // Add any missing phNodes
    while (this.phNodes.length < newPoints.length) {
      const idx = this.phNodes.length;
      const obj = new LabelledCircle(Object.assign({}, {
        fill: 'transparent',
        stroke: 'orangered',
        objectCaching: false // NB: So we can update obj.radius
      }, circleProps));
      // NB: We have to set position before canvas.add()
      obj.setPositionByOrigin(newPoints[idx], 'center', 'center');
      obj.hasControls = false;
      obj.on('moving', poly.phUpdateNode.bind(poly, obj));
      obj.on('scaling', (opt) => {
        const obj = opt.transform.target;
        // Ignore scaling (via. activeselection), instead update line based on node
        obj.set({ scaleX: 1, scaleY: 1 });
        poly.phUpdateNode(obj, opt);
      });
      obj.phPoly = this;
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
      width: newLimits.right - newLimits.left,
      height: newLimits.bottom - newLimits.top
    });
    this.setPositionByOrigin({ x: newLimits.left, y: newLimits.top }, 'left', 'top');
    this.setCoords(); // http://fabricjs.com/fabric-gotchas

    // Reposition nodes & polyline points
    const canvasToPoly = util.invertTransform(this.calcTransformMatrix());
    this.points = newPoints.map((p, i) => {
      const group = this.phNodes[i].group;
      const localP = group ? util.transformPoint(p, util.invertTransform(group.calcTransformMatrix())) : p;
      this.phNodes[i].setPositionByOrigin(localP, 'center', 'center');
      this.phNodes[i].setCoords();
      this.phNodes[i].phNodeIdx = i;
      this.phNodes[i].id = `${this.id}[${i}]`;
      // NB: Nodes are reused by index, so labels have to follow the points
      this.phNodes[i].phLabel = p.phLabel;

      return util.transformPoint(p, canvasToPoly);
    });

    // Make sure each phNode & line is scaled for current zoom level
    this.phNodes.forEach((obj, i) => {
      const endCap = i === 0 || i === (this.phNodes.length - 1);
      let radius = endCap ? endcapRadius : circleProps.radius;
      // NB: Hidden labels are still kept on the node, so they get synced
      obj.phShowLabel = !!opts.show_labels;
      if (obj.phShowLabel && obj.phLabel !== undefined) {
        // Grow to fit label, and fill so it's readable against the image
        radius = Math.max(radius, labelRadius(obj.phLabel));
        obj.fill = 'rgba(255, 255, 255, 0.7)';
      } else {
        obj.fill = circleProps.fill || 'transparent';
      }
      obj.strokeWidth = circleProps.strokeWidth / this.canvas.getZoom();
      obj.radius = radius / this.canvas.getZoom();
      obj.phLabelFontSize = labelFontSize / this.canvas.getZoom();
      obj.width = obj.height = (obj.radius + obj.strokeWidth) * 2;
    });
    this.strokeWidth = props.strokeWidth / this.canvas.getZoom();

    if (this.canvas) {
      if (opts.origin_is_focal_point) {
        this.canvas.phViewer.setFocalPoint(
          Math.floor(newPoints[0].x),
          Math.floor(newPoints[0].y)
        );
      }

      this.canvas.fire('object:modified', { target: this, phSuppressChange: suppressChange });
      this.canvas.requestRenderAll();
    }
  };

  // Helper to append point to existing list of nodes
  poly.phAddNode = function (newPoint, opt) {
    let i;
    const points = this.phNodes.map(nodePoint);
    // snap when this.canvas.phPrefs["ph-pref-snap-to-axis"] or ctrl
    const snapToAxis = (this.canvas.phPrefs['ph-pref-snap-to-axis'] && !opt.e.ctrlKey) || (!this.canvas.phPrefs['ph-pref-snap-to-axis'] && opt.e.ctrlKey);

    // Find first point that is further than the origin than our point, splice in new point here.
    for (i = 0; i < points.length; i++) {
      if (points[i].distanceFrom(points[0]) > newPoint.distanceFrom(points[0])) break;
    }

    if (!snapToAxis) {
      // no snapping to point
    } else if (i === points.length) {
      // Beyond end of line, use 2 previous points
      if (points.length > 1) newPoint = snapLine(points[points.length - 2], points[points.length - 1], newPoint, true);
    } else {
      newPoint = snapLine(points[i - 1], points[i], newPoint, true);
    }
    // NB: snapLine() can return an existing (labelled) point, new nodes have no label
    points.splice(i, 0, labelledPoint(newPoint.x, newPoint.y));

    poly.phSetPoints(points);
    this.canvas.setActiveObject(this.phNodes[i]);
  };

  // Update location of a moved node
  poly.phUpdateNode = function (phNode, opt) {
    const points = this.phNodes.map(nodePoint);
    // snap when both this.canvas.phPrefs["ph-pref-snap-to-axis"] opt.e.ctrlKey on or off
    const snapToAxis = (this.canvas.phPrefs['ph-pref-snap-to-axis'] && !opt.e.ctrlKey) || (!this.canvas.phPrefs['ph-pref-snap-to-axis'] && opt.e.ctrlKey);
    let snapped;

    if (!snapToAxis) {
      // no snapping to point
    } else if (phNode.phNodeIdx === 0) {
      // Start: Snap to line formed by previous point
      if (points.length > 2) snapped = snapLine(points[2], points[1], points[0]);
    } else if (phNode.phNodeIdx === points.length - 1) {
      // End: Snap to line formed by previous point
      if (points.length > 2) snapped = snapLine(points[points.length - 3], points[points.length - 2], points[phNode.phNodeIdx]);
    } else {
      snapped = snapLine(points[phNode.phNodeIdx - 1], points[phNode.phNodeIdx + 1], points[phNode.phNodeIdx], true);
    }
    if (snapped) {
      // NB: snapLine() returns a new (or other node's) point, keep this node's label
      points[phNode.phNodeIdx] = labelledPoint(snapped.x, snapped.y, phNode.phLabel);
    }
    poly.phSetPoints(points);
  };

  // Remove pointer to phNode
  poly.phRemoveNode = function (phNodeOrArray) {
    const nodesToRemove = Array.isArray(phNodeOrArray) ? phNodeOrArray : [phNodeOrArray];

    // We should at least have a line at the end of this
    if (nodesToRemove.length === 0 || (this.phNodes.length - nodesToRemove.length) < 2) return;

    const points = this.phNodes.filter((n) => !nodesToRemove.includes(n)).map(nodePoint);
    poly.phSetPoints(points);

    const oldIdx = nodesToRemove[0].phNodeIdx;
    this.canvas.setActiveObject(this.phNodes[Math.min(oldIdx, this.phNodes.length - 1)]);
  };

  poly.on('moving', (event) => {
    // Refresh points based on their new position
    const points = poly.phNodes.map(nodePoint);
    return poly.phSetPoints(points);
  });

  poly.on('phCanvasZoom', (event) => {
    // Refresh points to correct for any zoom error
    const points = poly.phNodes.map(nodePoint);
    return poly.phSetPoints(points, true);
  });

  // Wait for a bit, zoom to init canvas
  window.setTimeout(() => {
    // NB: This is failing for inital setup of scaleLine()
    if (poly.canvas) poly.fire('phCanvasZoom');
  }, 10);
  return poly;
}
