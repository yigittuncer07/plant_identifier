import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const BACKEND_URL = 'http://192.168.1.31:8000/identify';

type PlantData = {
  common_name: string;
  scientific_name: string | null;
  confidence: 'high' | 'medium' | 'low';
  description: string | null;
  care_tips: string | null;
  disambiguation: string | null;
  toxicity: string | null;
};

export default function App() {
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [plantData, setPlantData] = useState<PlantData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = async (type: 'camera' | 'library') => {
    const { status } =
      type === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission Required', `Permission to access ${type} is required.`);
      return false;
    }
    return true;
  };

  const handleImageResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets[0].uri && result.assets[0].base64) {
      setSelectedImageUri(result.assets[0].uri);
      setSelectedImageBase64(result.assets[0].base64);
      setPlantData(null);
      setError(null);
    }
  };

  const takePhoto = async () => {
    if (!(await requestPermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // reduced quality for faster uploads
      base64: true,
    });
    handleImageResult(result);
  };

  const pickImage = async () => {
    if (!(await requestPermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    handleImageResult(result);
  };

  const handleIdentify = async () => {
    if (!selectedImageBase64) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: selectedImageBase64 }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data: PlantData = await response.json();
      setPlantData(data);
    } catch (err: any) {
      setError(err.message || 'Network request failed. Check your connection and IP address.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedImageUri(null);
    setSelectedImageBase64(null);
    setPlantData(null);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Plant Identifier</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!plantData ? (
          <>
            <View style={styles.previewContainer}>
              {selectedImageUri ? (
                <Image source={{ uri: selectedImageUri }} style={styles.preview} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>No image selected</Text>
                </View>
              )}
            </View>

            <View style={styles.actionContainer}>
              <View style={styles.pickerRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto}>
                  <Text style={styles.secondaryButtonText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
                  <Text style={styles.secondaryButtonText}>Gallery</Text>
                </TouchableOpacity>
              </View>

              {selectedImageUri && (
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleIdentify}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Identify Plant</Text>}
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={styles.resultsContainer}>
            <Image source={{ uri: selectedImageUri! }} style={styles.resultImage} />
            
            <Text style={styles.resultTitle}>{plantData.common_name}</Text>
            {plantData.scientific_name && <Text style={styles.resultSubtitle}>{plantData.scientific_name}</Text>}

            <View style={styles.badgeRow}>
              <View style={[styles.badge, styles[`confidence_${plantData.confidence}` as keyof typeof styles]]}>
                <Text style={styles.badgeText}>{plantData.confidence.toUpperCase()} CONFIDENCE</Text>
              </View>
              {plantData.toxicity && plantData.toxicity.toLowerCase() !== 'unknown' && (
                <View style={[styles.badge, styles.badgeToxic]}>
                  <Text style={styles.badgeText}>⚠️ {plantData.toxicity}</Text>
                </View>
              )}
            </View>

            {plantData.disambiguation && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>💡 {plantData.disambiguation}</Text>
              </View>
            )}

            {plantData.description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.sectionText}>{plantData.description}</Text>
              </View>
            )}

            {plantData.care_tips && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Care Tips</Text>
                <Text style={styles.sectionText}>{plantData.care_tips}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={reset}>
              <Text style={styles.primaryButtonText}>Scan Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F6' },
  scrollContent: { padding: 20, flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#1B4332' },
  errorBox: { backgroundColor: '#FAD2E1', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: '#780000', fontSize: 14 },
  previewContainer: { height: 350, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E9EFEA', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D8E2DC', marginBottom: 24 },
  preview: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#84A98C', fontSize: 16 },
  actionContainer: { gap: 12 },
  pickerRow: { flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, backgroundColor: '#D8E2DC', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#1B4332', fontWeight: '600', fontSize: 16 },
  primaryButton: { backgroundColor: '#2D6A4F', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
  
  // Results UI
  resultsContainer: { flex: 1 },
  resultImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  resultTitle: { fontSize: 28, fontWeight: 'bold', color: '#1B4332' },
  resultSubtitle: { fontSize: 16, color: '#52796F', fontStyle: 'italic', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  confidence_high: { backgroundColor: '#40916C' },
  confidence_medium: { backgroundColor: '#E09F3E' },
  confidence_low: { backgroundColor: '#9E2A2B' },
  badgeToxic: { backgroundColor: '#9E2A2B' },
  warningBox: { backgroundColor: '#FFF3CD', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#FFEEBA' },
  warningText: { color: '#856404', fontSize: 14, lineHeight: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2D6A4F', marginBottom: 8 },
  sectionText: { fontSize: 15, color: '#333', lineHeight: 22 },
});