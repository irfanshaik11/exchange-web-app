// Transaction progress stages
export type TransactionStage = 
  | 'validating'
  | 'checking_pool'
  | 'preparing'
  | 'submitting'
  | 'confirming'
  | 'complete'
  | 'failed';

export interface ProgressStage {
  stage: TransactionStage;
  message: string;
  icon: string;
  estimatedDuration?: number; // in milliseconds
}

export const transactionStages: Record<TransactionStage, ProgressStage> = {
  validating: {
    stage: 'validating',
    message: 'Validating balance and parameters...',
    icon: 'validating',
    estimatedDuration: 500,
  },
  checking_pool: {
    stage: 'checking_pool',
    message: 'Checking pool availability...',
    icon: 'checking',
    estimatedDuration: 800,
  },
  preparing: {
    stage: 'preparing',
    message: 'Preparing transaction...',
    icon: 'preparing',
    estimatedDuration: 1000,
  },
  submitting: {
    stage: 'submitting',
    message: 'Submitting to blockchain...',
    icon: 'submitting',
    estimatedDuration: 3000,
  },
  confirming: {
    stage: 'confirming',
    message: 'Confirming transaction...',
    icon: 'confirming',
    estimatedDuration: 2000,
  },
  complete: {
    stage: 'complete',
    message: 'Transaction complete!',
    icon: 'complete',
  },
  failed: {
    stage: 'failed',
    message: 'Transaction failed',
    icon: 'failed',
  },
};

// Progress tracker class
export class TransactionProgressTracker {
  private currentStage: TransactionStage = 'validating';
  private onUpdate?: (stage: ProgressStage) => void;
  private timeouts: NodeJS.Timeout[] = [];

  constructor(onUpdate?: (stage: ProgressStage) => void) {
    this.onUpdate = onUpdate;
  }

  setStage(stage: TransactionStage) {
    this.currentStage = stage;
    const stageInfo = transactionStages[stage];
    if (this.onUpdate) {
      this.onUpdate(stageInfo);
    }
  }

  getCurrentStage(): ProgressStage {
    return transactionStages[this.currentStage];
  }

  // Auto-progress through stages with estimated durations
  async autoProgress(stages: TransactionStage[]) {
    for (const stage of stages) {
      this.setStage(stage);
      const stageInfo = transactionStages[stage];
      if (stageInfo.estimatedDuration) {
        await new Promise(resolve => {
          const timeout = setTimeout(resolve, stageInfo.estimatedDuration);
          this.timeouts.push(timeout);
        });
      }
    }
  }

  // Clear all timeouts
  clear() {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts = [];
  }

  // Complete the transaction
  complete() {
    this.clear();
    this.setStage('complete');
  }

  // Fail the transaction
  fail() {
    this.clear();
    this.setStage('failed');
  }
}

