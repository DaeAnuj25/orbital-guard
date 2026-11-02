import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Learning Centre — ORBITAL GUARD" };

const SECTIONS = [
  ["debris", "1 · Space debris"], ["orbits", "2 · LEO, MEO, GEO"], ["sensors", "3 · Radar vs optical"], ["detection", "4 · Object detection & deep learning"],
  ["yolo", "5 · YOLO and alternatives"], ["metrics", "6 · Precision, recall, F1, mAP"], ["tracking", "7 · Object tracking"], ["orbital", "8 · TLE, OMM, propagation, conjunctions"],
  ["chain", "9 · Detection ≠ tracking ≠ risk"], ["glossary", "Glossary"],
];

export default function LearnPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Learning Centre" subtitle="Beginner-friendly explanations of every concept the dashboard uses, with diagrams, worked examples and a glossary. Written for a second-year AI & Robotics student." badge={<Badge tone="info">Guide</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="card sticky top-20 hidden h-fit p-4 lg:block" aria-label="Sections">
          <ul className="space-y-1 text-sm">{SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block rounded px-2 py-1 text-slate-300 hover:bg-white/5 hover:text-cyan-200">{label}</a></li>)}</ul>
        </nav>
        <article className="prose-space card p-6 sm:p-8">
          <h2 id="debris" className="!mt-0">1 · Space debris and its types</h2>
          <p><strong>Space debris</strong> (orbital debris, &ldquo;space junk&rdquo;) is any human-made object in orbit that no longer serves a purpose. Main types:</p>
          <ul>
            <li><strong>Defunct spacecraft</strong> — satellites that ran out of fuel or failed (e.g. Envisat, 8 tonnes).</li>
            <li><strong>Rocket bodies</strong> — upper stages left in orbit after launch; large, massive, and prone to explode if propellant remains.</li>
            <li><strong>Fragmentation debris</strong> — pieces from explosions and collisions. The 2007 Fengyun-1C anti-satellite test (~3,500 tracked fragments) and the 2009 Iridium-33 / Cosmos-2251 collision (~2,300) are the two biggest sources. ORBITAL GUARD ships real element sets from both clouds.</li>
            <li><strong>Mission-related objects</strong> — lens caps, bolts, separation springs, released during normal operations.</li>
            <li><strong>Micro-debris</strong> — paint flakes, slag from solid rocket motors; too small to track but able to crater windows and solar arrays.</li>
          </ul>
          <p>Only objects larger than ~10 cm in LEO (~1 m in GEO) are routinely tracked and catalogued. The <strong>Kessler syndrome</strong> describes a runaway cascade where collisions generate debris faster than it decays.</p>

          <h2 id="orbits">2 · LEO, MEO and GEO</h2>
          <OrbitDiagram />
          <table>
            <thead><tr><th>Regime</th><th>Altitude</th><th>Period</th><th>Speed</th><th>Typical residents</th><th>Debris situation</th></tr></thead>
            <tbody>
              <tr><td>LEO</td><td>160–2,000 km</td><td>88–127 min</td><td>~7.8–6.9 km/s</td><td>ISS (≈420 km), Starlink, Earth observation</td><td>Most crowded; drag removes objects below ~600 km within years to decades</td></tr>
              <tr><td>MEO</td><td>2,000–35,786 km</td><td>2–24 h</td><td>~3.9 km/s (GPS)</td><td>GPS, Galileo, GLONASS</td><td>Sparse but no natural clean-up</td></tr>
              <tr><td>GEO</td><td>35,786 km (equatorial)</td><td>23 h 56 min</td><td>3.07 km/s</td><td>Communications, weather</td><td>One ring; dead satellites moved to a &ldquo;graveyard&rdquo; ~300 km higher</td></tr>
              <tr><td>HEO</td><td>eccentric (e.g. 500 × 40,000 km)</td><td>~12 h</td><td>varies</td><td>Molniya, GTO transfer stages</td><td>Crosses all shells</td></tr>
            </tbody>
          </table>
          <p>Speed follows from gravity: circular speed <code>v = √(μ / r)</code> with μ = 398,600 km³/s² and r the distance from Earth&rsquo;s centre. Lower orbits are faster, which is why LEO collision speeds reach 10–15 km/s.</p>

          <h2 id="sensors">3 · Radar versus optical observation</h2>
          <table>
            <thead><tr><th></th><th>Radar</th><th>Optical telescopes</th></tr></thead>
            <tbody>
              <tr><td>Works</td><td>Day and night, any weather (active illumination)</td><td>Night only, clear skies, object must be sunlit</td></tr>
              <tr><td>Best for</td><td>LEO (signal falls with range⁴)</td><td>MEO/GEO (brightness falls with range²); also cheap LEO surveys</td></tr>
              <tr><td>Measures</td><td>Range, range-rate, angles</td><td>Two angles (RA/Dec); no range from a single site</td></tr>
              <tr><td>Examples</td><td>Space Fence, TIRA, LeoLabs</td><td>GEODSS, ESA OGS, ZTF streaks, smart telescopes (StreaksYoloDataset)</td></tr>
            </tbody>
          </table>
          <p>In an optical frame a satellite appears as a <strong>streak</strong> if the telescope follows the stars (sidereal tracking), or as a point among streaked stars if it follows the object. This project&rsquo;s images are sidereal: <em>stars = points, movers = streaks</em>.</p>

          <h2 id="detection">4 · Object detection and deep learning</h2>
          <p><strong>Classification</strong> says what is in an image; <strong>detection</strong> also says <em>where</em>, with a bounding box <code>[x1, y1, x2, y2]</code> and a confidence score per object.</p>
          <p>Two families are used here:</p>
          <ol>
            <li><strong>Classical source extraction</strong> (our transparent baseline): estimate the background, estimate noise σ, keep pixels above <code>k·σ</code>, group connected pixels, measure centroid and shape. No training needed; parameters are physical (threshold in σ, PSF width). Weak when the background is structured or objects overlap.</li>
            <li><strong>Convolutional neural networks</strong> (YOLO): millions of parameters learned from labelled examples. Strong at complex appearance, but need data, can overfit, and produce uncalibrated confidences.</li>
          </ol>
          <p>A CNN detector learns features through stacked convolutions, predicts boxes at several scales, and is trained by minimising a loss that mixes <em>box regression</em> (how well the box fits), <em>classification</em> and, in YOLOv8, a <em>distribution focal loss</em> for box edges. Those three curves are what the Dataset &amp; Model page plots.</p>

          <h2 id="yolo">5 · YOLO and alternative detectors</h2>
          <ul>
            <li><strong>YOLO (You Only Look Once)</strong> — single-stage: one network pass predicts all boxes. Fast; v8 (Ultralytics) is anchor-free and the default here (<code>yolov8n</code> = nano, 3.2 M parameters, trains on a laptop CPU).</li>
            <li><strong>Faster R-CNN</strong> — two-stage: propose regions, then classify them. More accurate on small objects historically, slower.</li>
            <li><strong>RetinaNet</strong> — single-stage with focal loss to handle the huge background/foreground imbalance — relevant for sparse sky images.</li>
            <li><strong>DETR / RT-DETR</strong> — transformer-based, set prediction without NMS; needs more data.</li>
            <li><strong>Segmentation / regression approaches</strong> for streaks (e.g. Hough transform, Radon transform, DeepStreaks) exploit the line-like geometry directly.</li>
          </ul>
          <p>Why a P2 head as our &ldquo;improvement&rdquo;? YOLOv8 predicts at strides 8/16/32 px; a 6-pixel object is smaller than one cell of the finest map. Adding a stride-4 (P2) head gives the network a higher-resolution output designed for tiny objects — the dominant failure case for debris.</p>

          <h2 id="metrics">6 · Precision, recall, F1-score and mAP</h2>
          <MetricsDiagram />
          <p>A prediction is a <strong>true positive (TP)</strong> if it overlaps a ground-truth box enough (IoU ≥ 0.5 by convention) and has the right class; otherwise it is a <strong>false positive (FP)</strong>. A ground-truth object nobody predicted is a <strong>false negative (FN)</strong>.</p>
          <ul>
            <li><strong>Precision</strong> = TP / (TP + FP): of the things I reported, how many were real? Low precision = many false alarms.</li>
            <li><strong>Recall</strong> = TP / (TP + FN): of the real objects, how many did I find? Low recall = missed debris.</li>
            <li><strong>F1</strong> = 2·P·R / (P + R): harmonic mean, punishes imbalance.</li>
            <li><strong>IoU</strong> (intersection over union) = overlap area / union area of two boxes.</li>
            <li><strong>AP</strong> (average precision) = area under the precision–recall curve as the confidence threshold sweeps from 1 to 0; <strong>mAP@0.5</strong> averages AP over classes with IoU ≥ 0.5, <strong>mAP@0.5:0.95</strong> averages over IoU thresholds 0.5…0.95 (stricter: rewards tight boxes).</li>
          </ul>
          <p><em>Worked example:</em> 10 streaks in a test set; the model outputs 8 boxes, 6 correct. Precision = 6/8 = 0.75, recall = 6/10 = 0.60, F1 = 0.667. The 4 missed streaks were all fainter than SNR 5 → the failure-analysis table makes that visible.</p>

          <h2 id="tracking">7 · Object tracking</h2>
          <p>Detection treats each frame independently. <strong>Tracking</strong> links detections over time into trajectories with stable IDs. The standard recipe (SORT family) is:</p>
          <ol>
            <li><strong>Predict</strong> where each existing track should be in the new frame (a Kalman filter with a constant-velocity model: state <code>[x, y, vx, vy]</code>).</li>
            <li><strong>Associate</strong> predictions with new detections — by distance or IoU — within a gate; the Hungarian algorithm gives the optimal one-to-one assignment, greedy matching is a fast approximation.</li>
            <li><strong>Update</strong> matched tracks with their measurements; <strong>coast</strong> unmatched tracks on their prediction for a few frames (handles missed detections); <strong>spawn</strong> new tracks from unmatched detections; <strong>terminate</strong> tracks that keep missing.</li>
          </ol>
          <p>Typical failures: identity switches when two objects cross, fragmentation when an object vanishes longer than the coast limit, and ghost tracks from repeated false positives. In sidereal imagery a nearly zero velocity identifies a star — motion is the discriminator between stars and resident space objects.</p>

          <h2 id="orbital">8 · TLE, OMM, orbital propagation and conjunction analysis</h2>
          <TleDiagram />
          <p>A <strong>TLE</strong> (two-line element set) encodes the mean Keplerian elements of an object at an epoch: inclination, right ascension of the ascending node (RAAN), eccentricity, argument of perigee, mean anomaly and mean motion, plus a drag term B*. The <strong>OMM</strong> (Orbit Mean-Elements Message, CCSDS 502) carries the same content in JSON/XML/KVN with named fields and no column-counting.</p>
          <p><strong>SGP4</strong> is the analytical model that turns those mean elements into a position and velocity at any time, including secular effects of Earth&rsquo;s oblateness (J2), drag and — for deep-space objects — lunar/solar perturbations (SDP4). Its output frame is <strong>TEME</strong>. Accuracy is ~1 km at epoch and degrades by kilometres per day in LEO, so elements must be refreshed often (CelesTrak updates several times per day).</p>
          <p><strong>Conjunction analysis</strong> asks: will two objects come dangerously close? Steps:</p>
          <ol>
            <li><em>Screening</em>: propagate both, sample the separation, find minima (what this app does). Cheap filters first exclude pairs whose perigee/apogee shells never overlap.</li>
            <li><em>Refinement</em>: find the exact time of closest approach (TCA) and express the miss vector in the RIC frame of the primary (radial = altitude difference, in-track = along the velocity, cross-track = out of plane).</li>
            <li><em>Probability of collision (Pc)</em>: requires the position <strong>covariance</strong> of both objects; the 3-D problem is projected onto the encounter plane and integrated over the combined hard-body radius (Foster, Alfano, Chan methods). Operators act when Pc exceeds ~10⁻⁴. TLEs have no covariance, so this app stops at screening — and says so.</li>
          </ol>

          <h2 id="chain">9 · Detection vs tracking vs collision-risk assessment</h2>
          <table>
            <thead><tr><th>Question</th><th>Module</th><th>Input</th><th>Output</th><th>What it cannot say</th></tr></thead>
            <tbody>
              <tr><td>Is there something in this frame?</td><td>Detection</td><td>One image</td><td>Boxes + scores</td><td>Whether it is a star, satellite or debris</td></tr>
              <tr><td>Is it moving relative to the stars?</td><td>Tracking</td><td>Several frames</td><td>Pixel trajectories with IDs</td><td>Its orbit, altitude or identity</td></tr>
              <tr><td>Where is a catalogued object at time t?</td><td>Orbital analysis</td><td>TLE/OMM</td><td>Position/velocity (TEME), ground track</td><td>Anything about uncatalogued objects</td></tr>
              <tr><td>How close do two catalogued objects get?</td><td>Close approach</td><td>Two element sets</td><td>TCA, miss distance, RIC</td><td>A collision probability (no covariance)</td></tr>
            </tbody>
          </table>
          <p>Bridging the first two rows to the last two requires astrometry (pixels → sky angles), timing, orbit determination and catalogue correlation — the <em>future work</em> in this project.</p>

          <h2 id="glossary">Glossary</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {GLOSSARY.map(([term, def]) => <div key={term}><dt className="font-semibold text-cyan-200">{term}</dt><dd className="text-slate-300">{def}</dd></div>)}
          </dl>
          <p className="mt-8 text-xs text-slate-500">Further reading: ESA Space Environment Report; Vallado, <em>Fundamentals of Astrodynamics and Applications</em>; Vallado et al. 2006, &ldquo;Revisiting Spacetrack Report #3&rdquo;; Redmon et al. 2016 (YOLO); Bewley et al. 2016 (SORT); Parisot 2024 (StreaksYoloDataset). Now follow the <Link href="/tutorial" className="text-cyan-300 underline">step-by-step tutorial</Link> or try the <Link href="/detection" className="text-cyan-300 underline">Detection Lab</Link>.</p>
        </article>
      </div>
    </div>
  );
}

const GLOSSARY: Array<[string, string]> = [
  ["Apogee / perigee", "Farthest / closest point of an orbit from Earth."],
  ["B*", "TLE drag-like term (1/Earth radii) absorbing ballistic coefficient and density."],
  ["CDM", "Conjunction Data Message: operator warning with TCA, miss distance, covariance and Pc."],
  ["Covariance", "Matrix describing position/velocity uncertainty; needed for any collision probability."],
  ["Epoch", "Reference time of an element set."],
  ["GMST", "Greenwich Mean Sidereal Time: Earth rotation angle used to convert TEME to Earth-fixed."],
  ["IoU", "Intersection over union of two boxes (0–1)."],
  ["Kalman filter", "Recursive estimator combining a motion model with noisy measurements."],
  ["mAP", "Mean average precision over classes (and IoU thresholds)."],
  ["NMS", "Non-maximum suppression: removes duplicate overlapping boxes."],
  ["NORAD ID", "Catalogue number assigned by US Space Command (e.g. ISS = 25544)."],
  ["PSF", "Point-spread function: how a point of light is blurred by optics and seeing."],
  ["RIC / RSW", "Radial, in-track, cross-track frame attached to a spacecraft."],
  ["RSO", "Resident space object: any tracked object in orbit."],
  ["SGP4", "Simplified General Perturbations model #4, the propagator for TLEs."],
  ["Sidereal tracking", "Telescope follows the stars; moving objects appear as streaks."],
  ["SNR", "Signal-to-noise ratio: peak (or flux) divided by noise σ."],
  ["TCA", "Time of closest approach."],
  ["TEME", "True Equator Mean Equinox inertial frame used by SGP4 output."],
  ["TLE", "Two-line element set, 69-character fixed-column orbit description."],
];

function OrbitDiagram() {
  return (
    <svg viewBox="0 0 520 260" className="my-4 w-full max-w-2xl" role="img" aria-label="Diagram of LEO, MEO and GEO shells around Earth (not to scale)">
      <defs><radialGradient id="earth"><stop offset="0%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#0c4a6e" /></radialGradient></defs>
      <circle cx="130" cy="130" r="40" fill="url(#earth)" />
      <text x="130" y="134" textAnchor="middle" fontSize="11" fill="#e0f2fe">Earth</text>
      <circle cx="130" cy="130" r="58" fill="none" stroke="#22d3ee" strokeWidth="1.5" /><text x="190" y="80" fontSize="11" fill="#22d3ee">LEO 160–2,000 km (ISS, Starlink, most debris)</text>
      <circle cx="130" cy="130" r="88" fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="4 3" /><text x="215" y="110" fontSize="11" fill="#a78bfa">MEO ~20,000 km (GPS, Galileo)</text>
      <circle cx="130" cy="130" r="120" fill="none" stroke="#f59e0b" strokeWidth="1.2" /><text x="250" y="140" fontSize="11" fill="#f59e0b">GEO 35,786 km (comms, weather)</text>
      <ellipse cx="200" cy="130" rx="190" ry="60" fill="none" stroke="#f472b6" strokeWidth="1" strokeDasharray="2 3" /><text x="300" y="205" fontSize="11" fill="#f472b6">HEO (Molniya, transfer orbits)</text>
      <text x="10" y="250" fontSize="10" fill="#64748b">Not to scale. Period grows with altitude (90 min → 24 h); speed falls (7.8 → 3.1 km/s).</text>
    </svg>
  );
}

function MetricsDiagram() {
  return (
    <svg viewBox="0 0 560 170" className="my-4 w-full max-w-2xl" role="img" aria-label="Confusion of predictions and ground truth with IoU illustration">
      <rect x="20" y="30" width="90" height="70" fill="none" stroke="#a78bfa" strokeWidth="2" /><text x="22" y="24" fontSize="11" fill="#a78bfa">ground truth</text>
      <rect x="55" y="55" width="90" height="70" fill="none" stroke="#22d3ee" strokeWidth="2" /><text x="57" y="140" fontSize="11" fill="#22d3ee">prediction</text>
      <rect x="55" y="55" width="55" height="45" fill="#22d3ee" opacity="0.25" /><text x="160" y="80" fontSize="11" fill="#e2e8f0">IoU = overlap / union</text><text x="160" y="96" fontSize="11" fill="#94a3b8">≥ 0.5 → true positive</text>
      <g transform="translate(330,20)">
        <rect x="0" y="0" width="100" height="60" fill="#34d399" opacity="0.2" stroke="#34d399" /><text x="50" y="25" textAnchor="middle" fontSize="11" fill="#d1fae5">TP</text><text x="50" y="42" textAnchor="middle" fontSize="9" fill="#a7f3d0">found & real</text>
        <rect x="105" y="0" width="100" height="60" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" /><text x="155" y="25" textAnchor="middle" fontSize="11" fill="#fef3c7">FP</text><text x="155" y="42" textAnchor="middle" fontSize="9" fill="#fde68a">reported, not real</text>
        <rect x="0" y="65" width="100" height="60" fill="#fb7185" opacity="0.2" stroke="#fb7185" /><text x="50" y="90" textAnchor="middle" fontSize="11" fill="#ffe4e6">FN</text><text x="50" y="107" textAnchor="middle" fontSize="9" fill="#fecdd3">real, missed</text>
        <text x="105" y="95" fontSize="11" fill="#e2e8f0">P = TP/(TP+FP)</text><text x="105" y="112" fontSize="11" fill="#e2e8f0">R = TP/(TP+FN)</text>
      </g>
    </svg>
  );
}

function TleDiagram() {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-6">
      <div className="text-slate-500">ISS (ZARYA) — real element set bundled with the project</div>
      <div><span className="text-slate-500">1 </span><span className="text-cyan-300" title="NORAD id + classification">25544U</span> <span className="text-violet-300" title="International designator">98067A  </span> <span className="text-amber-300" title="Epoch YYDDD.DDDDDDDD">26294.04791053</span>  <span className="text-slate-300" title="1st derivative of mean motion">.00009575</span>  00000+0  <span className="text-emerald-300" title="B* drag term">18188-3</span> 0  9996</div>
      <div><span className="text-slate-500">2 </span><span className="text-cyan-300">25544</span>  <span className="text-amber-300" title="Inclination °">51.6327</span>  <span className="text-violet-300" title="RAAN °">37.2623</span> <span className="text-emerald-300" title="Eccentricity (0.0006759)">0006759</span> <span className="text-pink-300" title="Argument of perigee °">289.5321</span>  <span className="text-sky-300" title="Mean anomaly °">70.4938</span> <span className="text-orange-300" title="Mean motion rev/day">15.48967427</span>591263</div>
      <div className="mt-1 text-slate-400">Line 1: id · intl. designator · <span className="text-amber-300">epoch</span> · drag terms · checksum. Line 2: <span className="text-amber-300">inclination</span> · <span className="text-violet-300">RAAN</span> · <span className="text-emerald-300">eccentricity</span> · <span className="text-pink-300">arg. perigee</span> · <span className="text-sky-300">mean anomaly</span> · <span className="text-orange-300">mean motion</span> · rev number · checksum.</div>
    </div>
  );
}
