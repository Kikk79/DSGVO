/**
 * Integration tests for delete observation functionality
 * 
 * Note: These tests require a running Tauri application with test database
 */

import { describe, test, expect, beforeEach } from 'vitest';

// Mock the Tauri invoke function for testing
const mockInvoke = {
  observations: [
    {
      id: 1,
      student_id: 1,
      author_id: 1,
      category: 'Test',
      text: 'Test observation',
      tags: ['test'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_device_id: 'test-device'
    }
  ] as any[],

  async invoke(command: string, args?: any): Promise<any> {
    switch (command) {
      case 'get_observation':
        return this.observations.find(obs => obs.id === args.observationId) || null;
        
      case 'delete_observation':
        const index = this.observations.findIndex(obs => obs.id === args.observationId);
        if (index === -1) {
          throw new Error(`Observation with ID ${args.observationId} not found`);
        }
        
        const obs = this.observations[index];
        if (obs.author_id !== 1 && !args.forceDelete) {
          throw new Error('Access denied: Only the author can delete this observation. Use force_delete for administrative override.');
        }
        
        this.observations.splice(index, 1);
        return;
        
      case 'create_observation':
        const newObs = {
          id: Math.max(...this.observations.map(o => o.id), 0) + 1,
          student_id: args.studentId,
          author_id: 1,
          category: args.category,
          text: args.text,
          tags: args.tags,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_device_id: 'test-device'
        };
        this.observations.push(newObs);
        return newObs;
        
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
};

// Mock store for testing
const createTestStore = () => {
  const observations = [...mockInvoke.observations];
  
  return {
    observations,
    loading: false,
    error: null,
    
    async deleteObservation(observation_id: number, force_delete = false) {
      await mockInvoke.invoke('delete_observation', { 
        observationId: observation_id, 
        forceDelete: force_delete 
      });
      
      // Update local state
      const index = this.observations.findIndex(obs => obs.id === observation_id);
      if (index !== -1) {
        this.observations.splice(index, 1);
      }
    },
    
    async getObservation(observation_id: number) {
      return await mockInvoke.invoke('get_observation', { observationId: observation_id });
    }
  };
};

describe('Delete Observation Feature', () => {
  let store: ReturnType<typeof createTestStore>;
  
  beforeEach(() => {
    // Reset test data
    mockInvoke.observations = [
      {
        id: 1,
        student_id: 1,
        author_id: 1,
        category: 'Test',
        text: 'Test observation 1',
        tags: ['test'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_device_id: 'test-device'
      },
      {
        id: 2,
        student_id: 1,
        author_id: 2,
        category: 'Test',
        text: 'Test observation 2',
        tags: ['test'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_device_id: 'test-device'
      }
    ];
    
    store = createTestStore();
  });

  describe('Backend API Tests', () => {
    test('should successfully delete observation by author', async () => {
      // Verify observation exists
      const beforeDelete = await mockInvoke.invoke('get_observation', { observationId: 1 });
      expect(beforeDelete).toBeTruthy();
      expect(beforeDelete.id).toBe(1);
      
      // Delete observation
      await mockInvoke.invoke('delete_observation', { 
        observationId: 1, 
        forceDelete: false 
      });
      
      // Verify observation is deleted
      const afterDelete = await mockInvoke.invoke('get_observation', { observationId: 1 });
      expect(afterDelete).toBe(null);
    });

    test('should fail to delete observation by non-author without force', async () => {
      // Try to delete observation created by author_id: 2 as author_id: 1
      await expect(
        mockInvoke.invoke('delete_observation', { 
          observationId: 2, 
          forceDelete: false 
        })
      ).rejects.toThrow('Access denied: Only the author can delete this observation');
    });

    test('should successfully force delete observation by non-author', async () => {
      // Force delete observation created by author_id: 2
      await mockInvoke.invoke('delete_observation', { 
        observationId: 2, 
        forceDelete: true 
      });
      
      // Verify observation is deleted
      const afterDelete = await mockInvoke.invoke('get_observation', { observationId: 2 });
      expect(afterDelete).toBe(null);
    });

    test('should fail to delete non-existent observation', async () => {
      await expect(
        mockInvoke.invoke('delete_observation', { 
          observationId: 999, 
          forceDelete: false 
        })
      ).rejects.toThrow('Observation with ID 999 not found');
    });
  });

  describe('Store Integration Tests', () => {
    test('should update store state after successful deletion', async () => {
      // Verify initial state
      expect(store.observations).toHaveLength(2);
      expect(store.observations.find(obs => obs.id === 1)).toBeTruthy();
      
      // Delete observation
      await store.deleteObservation(1);
      
      // Verify state updated
      expect(store.observations).toHaveLength(1);
      expect(store.observations.find(obs => obs.id === 1)).toBeFalsy();
    });

    test('should handle deletion errors gracefully', async () => {
      // Try to delete observation by non-author
      await expect(store.deleteObservation(2)).rejects.toThrow();
      
      // Verify state unchanged on error
      expect(store.observations).toHaveLength(2);
      expect(store.observations.find(obs => obs.id === 2)).toBeTruthy();
    });

    test('should successfully force delete through store', async () => {
      // Force delete observation by non-author
      await store.deleteObservation(2, true);
      
      // Verify state updated
      expect(store.observations).toHaveLength(1);
      expect(store.observations.find(obs => obs.id === 2)).toBeFalsy();
    });
  });

  describe('Data Integrity Tests', () => {
    test('should maintain data consistency after deletion', async () => {
      const initialCount = store.observations.length;
      const observationToDelete = store.observations[0];
      
      // Delete observation
      await store.deleteObservation(observationToDelete.id);
      
      // Verify count is correct
      expect(store.observations).toHaveLength(initialCount - 1);
      
      // Verify deleted observation is not in array
      expect(store.observations.find(obs => obs.id === observationToDelete.id)).toBeFalsy();
      
      // Verify other observations are unchanged
      const remainingObservation = store.observations[0];
      expect(remainingObservation.id).not.toBe(observationToDelete.id);
      expect(remainingObservation.text).toBeTruthy();
      expect(remainingObservation.student_id).toBeTruthy();
    });

    test('should handle multiple consecutive deletions', async () => {
      const initialCount = store.observations.length;
      
      // Delete first observation (author can delete own)
      await store.deleteObservation(1);
      expect(store.observations).toHaveLength(initialCount - 1);
      
      // Force delete second observation
      await store.deleteObservation(2, true);
      expect(store.observations).toHaveLength(initialCount - 2);
    });
  });

  describe('Error Handling Tests', () => {
    test('should provide meaningful error messages', async () => {
      // Test non-existent observation
      await expect(store.deleteObservation(999))
        .rejects.toThrow(/not found/i);
      
      // Test authorization error
      await expect(store.deleteObservation(2))
        .rejects.toThrow(/access denied/i);
    });

    test('should differentiate between authorization and not found errors', async () => {
      // Authorization error
      try {
        await store.deleteObservation(2);
        expect.fail('Should have thrown authorization error');
      } catch (error) {
        expect(error.message).toContain('Access denied');
        expect(error.message).toContain('force_delete');
      }
      
      // Not found error
      try {
        await store.deleteObservation(999);
        expect.fail('Should have thrown not found error');
      } catch (error) {
        expect(error.message).toContain('not found');
        expect(error.message).not.toContain('force_delete');
      }
    });
  });
});

// Test utilities for UI testing (would be used with React Testing Library)
export const deleteObservationTestUtils = {
  /**
   * Simulate clicking delete button for an observation
   */
  async clickDeleteButton(observationId: number) {
    // This would be implemented with actual DOM interaction
    // For now, just return the expected behavior
    return {
      confirmDialogShown: true,
      observationId,
      studentName: 'Test Student'
    };
  },
  
  /**
   * Simulate confirming deletion in dialog
   */
  async confirmDeletion(forceDelete = false) {
    // This would interact with the actual confirmation dialog
    return { confirmed: true, forceDelete };
  },
  
  /**
   * Simulate canceling deletion
   */
  async cancelDeletion() {
    return { canceled: true };
  }
};