"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { supabase } from "@/lib/supabase";
import { useAppContext } from "./Providers";
import { Box, Fingertip, InteractionMode } from "@/types";
import { Loader2, PlusSquare, Crosshair, MousePointer2, Save, X, Hand } from "lucide-react";

interface CanvasEditorProps {
  file: File;
  onSaved: () => void;
}

const COLORS = {
  hand: "#10b981", // emerald
  target: "#f59e0b", // amber
  fingertip: "#ec4899", // pink
  drawing: "#3b82f6", // blue
};

export function CanvasEditor({ file, onSaved }: CanvasEditorProps) {
  const { userId, refreshCount } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const [mode, setMode] = useState<InteractionMode>("select");
  const [hands, setHands] = useState<Box[]>([]);
  const [targets, setTargets] = useState<Box[]>([]);
  const [fingertips, setFingertips] = useState<Fingertip[]>([]);
  
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number, y: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const [isResizing, setIsResizing] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Render Canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resize canvas to container
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate dynamic scale to fit image if offset and scale are default
    const PADDING = 40; // 20px padding on each side so it doesn't touch the very edges
    const pW = Math.max(10, canvas.width - PADDING);
    const pH = Math.max(10, canvas.height - PADDING);
    const fitScale = Math.min(pW / image.width, pH / image.height);
    
    // For simplicity, we center the image
    const drawW = image.width * fitScale;
    const drawH = image.height * fitScale;
    const offsetX = (canvas.width - drawW) / 2;
    const offsetY = (canvas.height - drawH) / 2;

    // We store these to globally map screen to image coordinates
    // Not using pan/zoom for simplicity, just fit to screen
    setScale((prev) => (Math.abs(prev - fitScale) < 0.0001 ? prev : fitScale));
    setOffset((prev) => (prev.x === offsetX && prev.y === offsetY ? prev : { x: offsetX, y: offsetY }));

    // Draw Image
    ctx.drawImage(image, offsetX, offsetY, drawW, drawH);

    // Helper to draw boxes
    const drawBoxes = (boxes: Box[], color: string) => {
      boxes.forEach(b => {
        const x = offsetX + b.x * fitScale;
        const y = offsetY + b.y * fitScale;
        const w = b.w * fitScale;
        const h = b.h * fitScale;

        ctx.strokeStyle = selectedBox === b.id ? "#ffffff" : color;
        ctx.lineWidth = selectedBox === b.id ? 3 : 2;
        ctx.strokeRect(x, y, w, h);

        // Label
        const displayLabel = b.pointing_type ? `${b.label || b.type} (${b.pointing_type})` : (b.label || b.type);
        if (displayLabel) {
          ctx.fillStyle = color;
          ctx.font = "12px sans-serif";
          ctx.fillRect(x, y - 20, ctx.measureText(displayLabel).width + 8, 20);
          ctx.fillStyle = "#fff";
          ctx.fillText(displayLabel, x + 4, y - 5);
        }

        if (selectedBox === b.id) {
           ctx.fillStyle = "rgba(255,255,255,0.2)";
           ctx.fillRect(x,y,w,h);
           
           // Draw resize handles
           const handleSize = 8;
           ctx.fillStyle = "#ffffff";
           ctx.strokeStyle = "#000000";
           ctx.lineWidth = 1;
           const handles = [
             { hx: x, hy: y },
             { hx: x + w, hy: y },
             { hx: x, hy: y + h },
             { hx: x + w, hy: y + h }
           ];
           handles.forEach(({ hx, hy }) => {
             ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
             ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
           });
        }
      });
    };

    drawBoxes(hands, COLORS.hand);
    drawBoxes(targets, COLORS.target);

    // Draw fingertips
    fingertips.forEach(ft => {
      const x = offsetX + ft.x * fitScale;
      const y = offsetY + ft.y * fitScale;
      ctx.fillStyle = COLORS.fingertip;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw active rectangle
    if (isDrawing && drawStart && drawCurrent) {
      const x = offsetX + Math.min(drawStart.x, drawCurrent.x) * fitScale;
      const y = offsetY + Math.min(drawStart.y, drawCurrent.y) * fitScale;
      const w = Math.abs(drawCurrent.x - drawStart.x) * fitScale;
      const h = Math.abs(drawCurrent.y - drawStart.y) * fitScale;

      ctx.strokeStyle = COLORS.drawing;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [drawCurrent, drawStart, fingertips, hands, image, isDrawing, selectedBox, targets]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getEventCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left - offset.x) / scale;
    let y = (e.clientY - rect.top - offset.y) / scale;

    if (image) {
      x = Math.max(0, Math.min(x, image.width));
      y = Math.max(0, Math.min(y, image.height));
    }

    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target instanceof Element && e.target.hasPointerCapture(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
    
    if (mode === 'place_fingertip') {
      const coords = getEventCoords(e);
      setFingertips([...fingertips, { id: `ft-${Date.now()}`, x: coords.x, y: coords.y }]);
      setMode("select");
      return;
    }

    if (mode === 'draw_hand' || mode === 'draw_target') {
      setIsDrawing(true);
      setDrawStart(getEventCoords(e));
      setDrawCurrent(getEventCoords(e));
      return;
    }

    if (mode === "select") {
      const coords = getEventCoords(e);
      let clickedHandle = null;

      if (selectedBox) {
        const box = [...hands, ...targets].find(b => b.id === selectedBox);
        if (box) {
          const handleArea = 20 / scale; // clickable area for handles
          if (Math.abs(coords.x - box.x) <= handleArea && Math.abs(coords.y - box.y) <= handleArea) clickedHandle = 'nw';
          else if (Math.abs(coords.x - (box.x + box.w)) <= handleArea && Math.abs(coords.y - box.y) <= handleArea) clickedHandle = 'ne';
          else if (Math.abs(coords.x - box.x) <= handleArea && Math.abs(coords.y - (box.y + box.h)) <= handleArea) clickedHandle = 'sw';
          else if (Math.abs(coords.x - (box.x + box.w)) <= handleArea && Math.abs(coords.y - (box.y + box.h)) <= handleArea) clickedHandle = 'se';
        }
      }

      if (clickedHandle) {
        setIsResizing(clickedHandle);
        return;
      }

      // Determine if a box is clicked
      const clickedBox = [...hands, ...targets].slice().reverse().find(b => 
        coords.x >= b.x && coords.x <= b.x + b.w &&
        coords.y >= b.y && coords.y <= b.y + b.h
      );

      if (clickedBox) {
        setSelectedBox(clickedBox.id);
        setIsDragging(true);
        setDragOffset({ x: coords.x - clickedBox.x, y: coords.y - clickedBox.y });
      } else {
        setSelectedBox(null);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing && !isResizing && !isDragging) return;
    const coords = getEventCoords(e);

    if (isDrawing) {
      setDrawCurrent(coords);
    } else if (isResizing && selectedBox) {
      const updateBoxResize = (boxes: Box[], setBoxes: Dispatch<SetStateAction<Box[]>>) => {
        const idx = boxes.findIndex(b => b.id === selectedBox);
        if (idx !== -1) {
          const newBoxes = [...boxes];
          const box = newBoxes[idx];
          let newX = box.x;
          let newY = box.y;
          let newW = box.w;
          let newH = box.h;

          if (isResizing === 'nw') {
            newW = box.w + (box.x - coords.x);
            newH = box.h + (box.y - coords.y);
            newX = coords.x;
            newY = coords.y;
          } else if (isResizing === 'ne') {
            newW = coords.x - box.x;
            newH = box.h + (box.y - coords.y);
            newY = coords.y;
          } else if (isResizing === 'sw') {
            newW = box.w + (box.x - coords.x);
            newH = coords.y - box.y;
            newX = coords.x;
          } else if (isResizing === 'se') {
            newW = coords.x - box.x;
            newH = coords.y - box.y;
          }

          // prevent negative or too small width/height
          if (newW > 5 && newH > 5) {
            newBoxes[idx] = { ...box, x: newX, y: newY, w: newW, h: newH };
            setBoxes(newBoxes);
          }
          return true;
        }
        return false;
      };
      if (!updateBoxResize(hands, setHands)) {
        updateBoxResize(targets, setTargets);
      }
    } else if (isDragging && selectedBox) {
      const updateBox = (boxes: Box[], setBoxes: Dispatch<SetStateAction<Box[]>>) => {
        const idx = boxes.findIndex(b => b.id === selectedBox);
        if (idx !== -1) {
          const newBoxes = [...boxes];
          const box = newBoxes[idx];
          
          let newX = coords.x - dragOffset.x;
          let newY = coords.y - dragOffset.y;
          
          if (image) {
            newX = Math.max(0, Math.min(newX, image.width - box.w));
            newY = Math.max(0, Math.min(newY, image.height - box.h));
          }
          
          newBoxes[idx] = { ...box, x: newX, y: newY };
          setBoxes(newBoxes);
          return true;
        }
        return false;
      };
      if (!updateBox(hands, setHands)) {
        updateBox(targets, setTargets);
      }
    }
  };

  const handlePointerUp = () => {
    if (isDrawing && drawStart && drawCurrent) {
      const x = Math.min(drawStart.x, drawCurrent.x);
      const y = Math.min(drawStart.y, drawCurrent.y);
      const w = Math.abs(drawCurrent.x - drawStart.x);
      const h = Math.abs(drawCurrent.y - drawStart.y);

      if (w > 10 && h > 10) {
        const newBox: Box = { id: `b-${Date.now()}`, x, y, w, h, type: mode === 'draw_hand' ? 'hand' : 'target' };
        if (mode === 'draw_hand') setHands([...hands, newBox]);
        else setTargets([...targets, newBox]);
      }
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      setMode("select");
    }
    setIsDragging(false);
    setIsResizing(null);
  };

  const deleteSelected = () => {
    if (selectedBox) {
      setHands(hands.filter(h => h.id !== selectedBox));
      setTargets(targets.filter(t => t.id !== selectedBox));
      setSelectedBox(null);
    }
  };

  const saveToSupabase = async () => {
    if (!userId || !image) return;
    setIsSaving(true);
    try {
      // 1. Get raw base image
      const rawExt = file.name.split('.').pop() || 'jpg';
      const baseName = `${userId}_${Date.now()}`;
      
      const rawPath = `raw/${baseName}.${rawExt}`;
      const { error: rawError } = await supabase.storage
        .from('dataset_images')
        .upload(rawPath, file);

      if (rawError) throw rawError;
      
      const { data: { publicUrl: rawUrl } } = supabase.storage.from('dataset_images').getPublicUrl(rawPath);

      // 2. Export annotated canvas (visual confirmation)
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not accessible");
      
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) throw new Error("Failed to export canvas blob");
      
      const annPath = `annotated/${baseName}.jpg`;
      const { error: annError } = await supabase.storage
        .from('dataset_images')
        .upload(annPath, blob);
        
      if (annError) throw annError;
      const { data: { publicUrl: annUrl } } = supabase.storage.from('dataset_images').getPublicUrl(annPath);

      let topPointingType = "None";
      const handWithPointing = hands.find(h => h.pointing_type && h.pointing_type !== "");
      if (handWithPointing) {
        topPointingType = handWithPointing.pointing_type!;
      }

      // 3. Save coordinates to DB
      const { error: dbError } = await supabase.from('annotations').insert({
        user_id: userId,
        base_image_url: rawUrl,
        annotated_image_url: annUrl,
        hand_boxes: hands,
        target_boxes: targets,
        fingertips: fingertips,
        pointing_type: topPointingType
      });

      if (dbError) throw dbError;

      // Provide mobile users with clear feedback before clearing
      alert("Annotation saved successfully!");

      // Update global context
      refreshCount();
      onSaved();
      
    } catch (e) {
      console.error(e);
      alert("Failed to save annotation to Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-full overflow-hidden">
      {/* Toolbar Area */}
      <div className="w-full md:w-64 bg-secondary/95 backdrop-blur-sm border-t md:border-t-0 md:border-r p-3 pb-8 md:pb-3 flex flex-col gap-3 shrink-0 overflow-y-auto max-h-[45vh] md:max-h-full order-2 md:order-1 z-10">
        <h3 className="hidden md:block font-semibold text-sm uppercase text-muted-foreground tracking-wider shrink-0">Tools</h3>
        
        {/* Tools grid */}
        <div className="grid grid-cols-4 md:grid-cols-1 gap-2 shrink-0">
          <ToolButton 
            active={mode === 'select'} 
            onClick={() => setMode('select')}
            icon={<MousePointer2 className="w-4 h-4" />}
            label="Select"
          />
          <ToolButton 
            active={mode === 'draw_hand'} 
            onClick={() => setMode('draw_hand')}
            icon={<Hand className="w-4 h-4" />}
            label="Hand"
            color={COLORS.hand}
          />
          <ToolButton 
            active={mode === 'draw_target'} 
            onClick={() => setMode('draw_target')}
            icon={<PlusSquare className="w-4 h-4" />}
            label="Target"
            color={COLORS.target}
          />
          <ToolButton 
            active={mode === 'place_fingertip'} 
            onClick={() => setMode('place_fingertip')}
            icon={<Crosshair className="w-4 h-4" />}
            label="Tip"
            color={COLORS.fingertip}
          />
        </div>

        <div className="w-full h-px bg-border my-1 shrink-0" />
        
        {/* Selected Box UI */}
        {selectedBox && (
          <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 flex flex-col gap-3 shrink-0">
             <div className="flex justify-between items-center">
                <p className="text-xs text-destructive font-bold uppercase tracking-wide">Selected</p>
                <span className="text-[10px] bg-background px-2 py-0.5 rounded text-muted-foreground">ID: {selectedBox.split('-')[2]}</span>
             </div>
             
             {/* Box Type Selection */}
             {(() => {
               const box = [...hands, ...targets].find(b => b.id === selectedBox);
               if (box && box.type === 'hand') {
                 return (
                   <div className="flex flex-col gap-1.5">
                     <label className="text-xs font-semibold text-foreground">Pointing Type:</label>
                     <select
                       value={box.pointing_type || ""}
                       onChange={(e) => {
                         const val = e.target.value;
                         setHands(hands.map(h => h.id === selectedBox ? { ...h, pointing_type: val } : h));
                       }}
                       className="w-full text-xs p-2 rounded-md bg-background border border-border text-foreground focus:ring-2 focus:ring-primary outline-none"
                     >
                       <option value="">(None)</option>
                       <option value="pointing from distance">Pointing from distance</option>
                       <option value="pointing at empty space">Pointing at empty space</option>
                     </select>
                   </div>
                 );
               }
               return null;
             })()}

             <button 
                onClick={deleteSelected}
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm py-2 rounded-md transition-colors font-medium flex items-center justify-center gap-2 mt-1"
              >
               <X className="w-4 h-4" /> Delete Box
             </button>
          </div>
        )}

        {fingertips.length > 0 && (
          <button 
            onClick={() => setFingertips([])}
            className="text-xs font-medium text-destructive hover:text-destructive/80 text-center px-2 py-1 bg-destructive/10 rounded-md shrink-0"
          >
            Clear Fingertips
          </button>
        )}

        {/* Spacer for desktop */}
        <div className="flex-1 hidden md:block" />

        {/* Save button pinned to bottom/end */}
        <button 
          onClick={saveToSupabase}
          disabled={isSaving}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none shrink-0 mt-auto"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />}
          {isSaving ? "Saving..." : "Save & Next"}
        </button>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={containerRef} 
        className="flex-1 relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-black cursor-crosshair touch-none min-h-0 min-w-0 order-1 md:order-2"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ touchAction: 'none' }} />
      </div>
    </div>
  );
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  color?: string;
}

function ToolButton({ active, onClick, icon, label, color }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 py-2 md:px-3 md:py-2.5 rounded-lg text-xs md:text-sm font-medium transition-all w-full text-center md:text-left
        ${active 
          ? 'bg-primary/20 text-primary border border-primary/50 shadow-inner' 
          : 'bg-background border border-border text-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
    >
      <div style={{ color: active && color ? color : 'inherit' }}>
        {icon}
      </div>
      <span className="truncate w-full">{label}</span>
    </button>
  );
}
