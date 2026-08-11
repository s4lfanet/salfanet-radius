'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export interface ParameterNode {
  /** Dot-separated full path, e.g. "Device.DeviceInfo.SoftwareVersion" */
  path: string;
  value?: string | number | boolean | null;
  type?: string;
  /** Whether to show children (true = is a branch, has sub-params) */
  children?: ParameterNode[];
}

interface TreeNodeProps {
  node: ParameterNode;
  depth?: number;
}

function TreeNode({ node, depth = 0 }: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;
  const label = node.path.split('.').pop() ?? node.path;

  return (
    <div className="text-sm font-mono">
      <div
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-default"
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          )
        ) : (
          <span className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        {!hasChildren && node.value !== undefined && (
          <>
            <span className="mx-1 text-gray-400">=</span>
            <span className="text-blue-600 dark:text-blue-400 truncate max-w-xs">
              {String(node.value)}
            </span>
            {node.type && (
              <span className="ml-1.5 text-gray-400 text-xs">({node.type})</span>
            )}
          </>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  nodes: ParameterNode[];
}

/**
 * Recursive collapsible tree for GenieACS device parameter tree.
 * Pass `nodes` as a flat or nested list of ParameterNode.
 */
export function ParameterTree({ nodes }: Props) {
  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500">No parameters found.</p>;
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-auto max-h-[60vh]">
      {nodes.map((n) => (
        <TreeNode key={n.path} node={n} />
      ))}
    </div>
  );
}
