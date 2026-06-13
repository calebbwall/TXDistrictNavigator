import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Alert,
  Pressable,
  FlatList,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

type PrayerCategory = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export default function ManageCategoriesScreen() {
  const { theme } = useTheme();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [newCategoryName, setNewCategoryName] = useState("");
  const [renameTarget, setRenameTarget] = useState<PrayerCategory | null>(null);
  const [renameText, setRenameText] = useState("");

  const {
    data: categories = [],
    isLoading,
    refetch,
  } = useQuery<PrayerCategory[]>({
    queryKey: ["/api/prayer-categories"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/prayer-categories", {
        name: newCategoryName.trim(),
      });
    },
    onSuccess: () => {
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-categories"] });
    },
    onError: (err: Error) => {
      const msg = err.message;
      if (msg.includes("already exists")) {
        Alert.alert(
          "Duplicate",
          "A category with this name already exists. Please choose a different name.",
        );
      } else {
        Alert.alert("Error", "Could not create category. Please try again.");
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (vars: { id: string; name: string }) => {
      await apiRequest("PATCH", `/api/prayer-categories/${vars.id}`, {
        name: vars.name.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-categories"] });
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/prayer-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-categories"] });
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const handleAddCategory = () => {
    if (newCategoryName.trim().length === 0) {
      Alert.alert("Error", "Category name cannot be empty");
      return;
    }
    createMutation.mutate();
  };

  const handleRenameCategory = (category: PrayerCategory) => {
    setRenameTarget(category);
    setRenameText(category.name);
  };

  const submitRename = () => {
    const name = renameText.trim();
    if (renameTarget && name.length > 0 && name !== renameTarget.name) {
      renameMutation.mutate({ id: renameTarget.id, name });
    }
    setRenameTarget(null);
    setRenameText("");
  };

  const handleDeleteCategory = (category: PrayerCategory) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${category.name}"? Prayers in this category will no longer have a category assigned.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(category.id);
          },
        },
      ],
    );
  };

  const canAddCategory = newCategoryName.trim().length > 0;

  const renderCategoryItem = ({ item }: { item: PrayerCategory }) => (
    <Card elevation={1} style={styles.categoryCard}>
      <View style={styles.categoryRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body" style={styles.categoryName}>
            {item.name}
          </ThemedText>
        </View>
        <View style={styles.iconRow}>
          <Pressable
            onPress={() => handleRenameCategory(item)}
            hitSlop={8}
            style={{ padding: Spacing.xs }}
          >
            <Feather name="edit-2" size={18} color={theme.primary} />
          </Pressable>
          <Pressable
            onPress={() => handleDeleteCategory(item)}
            hitSlop={8}
            style={{ padding: Spacing.xs }}
          >
            <Feather name="trash-2" size={18} color={theme.secondary} />
          </Pressable>
        </View>
      </View>
    </Card>
  );

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={styles.addRow}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBackground,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
          placeholder="New category name..."
          placeholderTextColor={theme.secondaryText}
          value={newCategoryName}
          onChangeText={setNewCategoryName}
          editable={!createMutation.isPending}
        />
        <Button
          onPress={handleAddCategory}
          disabled={!canAddCategory || createMutation.isPending}
          style={styles.addButton}
        >
          <Feather name="plus" size={20} color={theme.buttonText} />
        </Button>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.lg }} />
      ) : categories.length > 0 ? (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderCategoryItem}
          scrollEnabled={false}
          contentContainerStyle={{ gap: Spacing.sm, marginTop: Spacing.md }}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Feather name="folder" size={48} color={theme.secondaryText} />
          <ThemedText
            type="body"
            style={[styles.emptyText, { color: theme.secondaryText }]}
          >
            No categories yet
          </ThemedText>
        </View>
      )}

      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRenameTarget(null)}
        >
          <Pressable
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
            onPress={() => {}}
          >
            <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>
              Rename Category
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBackground,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="Category name..."
              placeholderTextColor={theme.secondaryText}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              onSubmitEditing={submitRename}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setRenameTarget(null)}
              >
                <ThemedText type="body" style={{ color: theme.text }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Button
                onPress={submitRename}
                disabled={
                  renameText.trim().length === 0 || renameMutation.isPending
                }
                style={{ flex: 1 }}
              >
                {renameMutation.isPending ? "Saving..." : "Rename"}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
    height: 48,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  categoryCard: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryName: {
    fontWeight: "500",
  },
  iconRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    marginTop: Spacing.md,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
