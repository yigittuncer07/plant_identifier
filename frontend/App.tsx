import React, { useEffect, useMemo, useState, useRef} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

// REPLACE THIS WITH YOUR COMPUTER'S LOCAL IP ADDRESS
const BACKEND_URL = 'http://192.168.1.31:8000/identify';

// -----------------------------------------------------------------------------
// Types (mirrors the /identify response contract)
// -----------------------------------------------------------------------------

type Confidence = 'high' | 'medium' | 'low';
type HealthStatus = 'healthy' | 'diseased' | 'pest_infestation';

type PlantHealth = {
  status: HealthStatus;
  diagnosis: string | null;
  treatment: string | null;
};

type PlantData = {
  common_name: string;
  scientific_name: string | null;
  confidence: Confidence;
  description: string | null;
  watering_frequency_days: number | null;
  sunlight_requirement: string | null;
  difficulty_level: string | null;
  plant_health: PlantHealth | null;
  disambiguation: string | null;
  toxicity: string | null;
  latency_ms: number;
};

// -----------------------------------------------------------------------------
// Theme
// -----------------------------------------------------------------------------

type Theme = typeof lightTheme;

const lightTheme = {
  mode: 'light' as const,
  background: '#F7F9F6',
  card: '#FFFFFF',
  surface: '#E9EFEA',
  surfaceAlt: '#D8E2DC',
  border: '#E3EAE3',
  text: '#1B4332',
  textSecondary: '#52796F',
  textMuted: '#84A98C',
  primary: '#2D6A4F',
  primaryText: '#FFFFFF',
  success: '#2F7A4B',
  successBg: '#E3F3E7',
  successBorder: '#BFE3C8',
  warning: '#9A6B00',
  warningBg: '#FFF3D6',
  warningBorder: '#F5DFA0',
  danger: '#9E2A2B',
  dangerBg: '#FBE2E2',
  dangerBorder: '#F0C2C2',
  overlay: 'rgba(0,0,0,0.04)',
};

const darkTheme = {
  ...lightTheme,
  mode: 'dark' as const,
  background: '#121212',
  card: '#1C1F1D',
  surface: '#1E1E1E',
  surfaceAlt: '#26302A',
  border: '#2A3B32',
  text: '#E9EFEA',
  textSecondary: '#A3B1A9',
  textMuted: '#6B7C72',
  primary: '#40916C',
  primaryText: '#FFFFFF',
  success: '#7FCF9B',
  successBg: '#1C3226',
  successBorder: '#2C4A38',
  warning: '#E8C468',
  warningBg: '#332B14',
  warningBorder: '#4D4020',
  danger: '#E68A8B',
  dangerBg: '#3A2020',
  dangerBorder: '#552B2B',
  overlay: 'rgba(255,255,255,0.04)',
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const HEALTH_COPY: Record<HealthStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  healthy: { label: 'Looking healthy', tone: 'success' },
  diseased: { label: 'Signs of disease', tone: 'warning' },
  pest_infestation: { label: 'Pest infestation found', tone: 'danger' },
};

// Loading copy shown while we wait on the backend. The upload itself is
// instant from the user's point of view, so we don't cycle back through
// an "uploading" message once analysis has started.
const LOADING_MESSAGES = [
  'Analyzing leaf structure...',
  'Evaluating plant health...',
  'Cross-referencing plant database...',
];
const LOADING_INTERVAL_MS = 1500;

const NOT_A_PLANT = 'not a plant';

// -----------------------------------------------------------------------------
// Small presentational helpers
// -----------------------------------------------------------------------------

function toneColors(theme: Theme, tone: 'success' | 'warning' | 'danger') {
  if (tone === 'success') {
    return { fg: theme.success, bg: theme.successBg, border: theme.successBorder };
  }
  if (tone === 'warning') {
    return { fg: theme.warning, bg: theme.warningBg, border: theme.warningBorder };
  }
  return { fg: theme.danger, bg: theme.dangerBg, border: theme.dangerBorder };
}

/** Reads a free-text toxicity string and works out whether it's a safety warning. */
function readToxicity(toxicity: string): { isSafe: boolean; label: string } {
  const normalized = toxicity.toLowerCase();
  const isSafe = normalized.includes('non-toxic') || normalized.includes('non toxic') || normalized.includes('safe');
  return { isSafe, label: isSafe ? 'Safe around pets & people' : 'Toxicity warning' };
}

function formatSunlight(value: string): string {
  const key = value.toLowerCase();
  if (key === 'direct') return 'Direct sunlight';
  if (key === 'indirect') return 'Bright, indirect light';
  if (key === 'low') return 'Low light';
  return value;
}

function formatDifficulty(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------

function IdentifierScreen() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const theme = isDarkMode ? darkTheme : lightTheme;
  const styles = useMemo(() => createStyles(theme), [isDarkMode]);

  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isRequestingRef = useRef(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [plantData, setPlantData] = useState<PlantData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cycle through the loading copy while a request is in flight.
  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, LOADING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading]);

  const toggleDarkMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDarkMode((prev) => !prev);
  };

  const requestPermission = async (type: 'camera' | 'library') => {
    const { status } =
      type === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('Permission needed', `Allow access to your ${type === 'camera' ? 'camera' : 'photos'} to identify a plant.`);
      return false;
    }
    return true;
  };

  const handleImageResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri || !asset?.base64) return;
    setSelectedImageUri(asset.uri);
    setSelectedImageBase64(asset.base64);
    setPlantData(null);
    setError(null);
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!(await requestPermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    handleImageResult(result);
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    // 1. Immediately reject if a request is already in flight
    if (!selectedImageBase64 || isRequestingRef.current) return;
    
    // 2. Lock it synchronously
    isRequestingRef.current = true;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: selectedImageBase64 }),
      });

      if (!response.ok) {
        throw new Error(`The server had a problem (status ${response.status}). Please try again.`);
      }

      const data: PlantData = await response.json();
      setPlantData(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Check your connection and try again.';
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      // 3. Release the lock and state when finished
      setLoading(false);
      isRequestingRef.current = false;
    }
  };

  const reset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedImageUri(null);
    setSelectedImageBase64(null);
    setPlantData(null);
    setError(null);
  };

  const isPlantDetected = plantData !== null && plantData.common_name.trim().toLowerCase() !== NOT_A_PLANT;
  const isNoPlantDetected = plantData !== null && !isPlantDetected;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Plant Identifier</Text>
          <TouchableOpacity
            onPress={toggleDarkMode}
            style={styles.themeToggle}
            accessibilityRole="button"
            accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Text style={styles.themeToggleText}>{isDarkMode ? 'Light mode' : 'Dark mode'}</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Couldn't identify your plant</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {isNoPlantDetected && (
          <NoPlantFound theme={theme} styles={styles} imageUri={selectedImageUri} onRetry={reset} />
        )}

        {isPlantDetected && plantData && (
          <PlantResult theme={theme} styles={styles} data={plantData} imageUri={selectedImageUri} onReset={reset} />
        )}

        {!plantData && (
          <>
            <View style={styles.previewContainer}>
              {selectedImageUri ? (
                <Image source={{ uri: selectedImageUri }} style={styles.preview} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>Take or choose a photo of a plant to get started</Text>
                </View>
              )}
            </View>

            <View style={styles.actionContainer}>
              <View style={styles.pickerRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto} accessibilityRole="button">
                  <Text style={styles.secondaryButtonText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={pickImage} accessibilityRole="button">
                  <Text style={styles.secondaryButtonText}>Gallery</Text>
                </TouchableOpacity>
              </View>

              {selectedImageUri && (
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleIdentify}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color={theme.primaryText} />
                      <Text style={styles.loadingText}>{LOADING_MESSAGES[loadingMessageIndex]}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>Identify plant</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <IdentifierScreen />
    </SafeAreaProvider>
  );
}

// -----------------------------------------------------------------------------
// "Not a plant" state
// -----------------------------------------------------------------------------

function NoPlantFound({
  theme,
  styles,
  imageUri,
  onRetry,
}: {
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  imageUri: string | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.resultsContainer}>
      {imageUri && <Image source={{ uri: imageUri }} style={styles.resultImage} />}
      <View style={styles.noPlantBox}>
        <Text style={styles.noPlantTitle}>We couldn't find a plant in this photo</Text>
        <Text style={styles.noPlantText}>
          Try a photo with the plant centered, in focus, and with good lighting.
        </Text>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Try another photo</Text>
      </TouchableOpacity>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Successful result
// -----------------------------------------------------------------------------

function PlantResult({
  theme,
  styles,
  data,
  imageUri,
  onReset,
}: {
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  data: PlantData;
  imageUri: string | null;
  onReset: () => void;
}) {
  const toxicity = data.toxicity && data.toxicity.toLowerCase() !== 'unknown' ? readToxicity(data.toxicity) : null;

  return (
    <View style={styles.resultsContainer}>
      {imageUri && <Image source={{ uri: imageUri }} style={styles.resultImage} />}

      <Text style={styles.resultTitle}>{data.common_name}</Text>
      {data.scientific_name && <Text style={styles.resultSubtitle}>{data.scientific_name}</Text>}

      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={[styles.badgeText, { color: theme.text }]}>{CONFIDENCE_LABEL[data.confidence]}</Text>
        </View>
      </View>

      {data.confidence === 'low' && data.disambiguation && (
        <InfoBanner theme={theme} styles={styles} tone="warning" title="This identification isn't certain" body={data.disambiguation} />
      )}
      {data.confidence !== 'low' && data.disambiguation && (
        <InfoBanner theme={theme} styles={styles} tone="neutral" title="Good to know" body={data.disambiguation} />
      )}

      {data.plant_health && <HealthCard theme={theme} styles={styles} health={data.plant_health} />}

      <View style={styles.careSection}>
        <Text style={styles.sectionTitle}>Care guide</Text>
        <View style={styles.careList}>
          {data.watering_frequency_days != null && (
            <CareRow
              styles={styles}
              label="Watering"
              value={`Every ${data.watering_frequency_days} ${data.watering_frequency_days === 1 ? 'day' : 'days'}`}
            />
          )}
          {data.sunlight_requirement && (
            <CareRow styles={styles} label="Sunlight" value={formatSunlight(data.sunlight_requirement)} />
          )}
          {data.difficulty_level && (
            <CareRow styles={styles} label="Difficulty" value={formatDifficulty(data.difficulty_level)} />
          )}
          {data.watering_frequency_days == null && !data.sunlight_requirement && !data.difficulty_level && (
            <Text style={styles.mutedText}>Care details aren't available for this plant.</Text>
          )}
        </View>
      </View>

      {toxicity && (
        <View
          style={[
            styles.toxicityBox,
            {
              backgroundColor: toxicity.isSafe ? theme.successBg : theme.dangerBg,
              borderColor: toxicity.isSafe ? theme.successBorder : theme.dangerBorder,
            },
          ]}
        >
          <Text style={[styles.toxicityLabel, { color: toxicity.isSafe ? theme.success : theme.danger }]}>
            {toxicity.label}
          </Text>
          <Text style={styles.toxicityDetail}>{data.toxicity}</Text>
        </View>
      )}

      {data.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About this plant</Text>
          <Text style={styles.sectionText}>{data.description}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={onReset} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Scan another plant</Text>
      </TouchableOpacity>

      <Text style={styles.footerText}>Identified in {(data.latency_ms / 1000).toFixed(1)}s</Text>
    </View>
  );
}

function CareRow({ styles, label, value }: { styles: ReturnType<typeof createStyles>; label: string; value: string }) {
  return (
    <View style={styles.careRow}>
      <Text style={styles.careLabel}>{label}</Text>
      <Text style={styles.careValue}>{value}</Text>
    </View>
  );
}

function InfoBanner({
  theme,
  styles,
  tone,
  title,
  body,
}: {
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  tone: 'warning' | 'neutral';
  title: string;
  body: string;
}) {
  const colors = tone === 'warning' ? toneColors(theme, 'warning') : { fg: theme.text, bg: theme.surface, border: theme.border };
  return (
    <View style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.bannerTitle, { color: colors.fg }]}>{title}</Text>
      <Text style={styles.bannerBody}>{body}</Text>
    </View>
  );
}

function HealthCard({
  theme,
  styles,
  health,
}: {
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  health: PlantHealth;
}) {
  const copy = HEALTH_COPY[health.status];
  const colors = toneColors(theme, copy.tone);

  return (
    <View style={[styles.healthCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.healthStatus, { color: colors.fg }]}>{copy.label}</Text>

      {health.status !== 'healthy' && (
        <>
          {health.diagnosis && (
            <View style={styles.healthRow}>
              <Text style={styles.healthRowLabel}>What we found</Text>
              <Text style={styles.healthRowValue}>{health.diagnosis}</Text>
            </View>
          )}
          {health.treatment && (
            <View style={styles.healthRow}>
              <Text style={styles.healthRowLabel}>Recommended treatment</Text>
              <Text style={styles.healthRowValue}>{health.treatment}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------------

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scrollContent: { padding: 20, flexGrow: 1 },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    title: { fontSize: 24, fontWeight: '700', color: theme.text },
    themeToggle: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surfaceAlt, borderRadius: 20 },
    themeToggleText: { fontSize: 12, fontWeight: '600', color: theme.text },

    errorBox: {
      backgroundColor: theme.dangerBg,
      borderWidth: 1,
      borderColor: theme.dangerBorder,
      padding: 14,
      borderRadius: 10,
      marginBottom: 16,
    },
    errorTitle: { color: theme.danger, fontWeight: '700', marginBottom: 4 },
    errorText: { color: theme.danger, fontSize: 14 },

    previewContainer: {
      height: 350,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 24,
    },
    preview: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    placeholderText: { color: theme.textMuted, fontSize: 16, textAlign: 'center' },

    actionContainer: { gap: 12 },
    pickerRow: { flexDirection: 'row', gap: 12 },
    secondaryButton: {
      flex: 1,
      backgroundColor: theme.surfaceAlt,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    secondaryButtonText: { color: theme.text, fontWeight: '600', fontSize: 16 },

    primaryButton: {
      backgroundColor: theme.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
    buttonDisabled: { opacity: 0.75 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    loadingText: { color: theme.primaryText, fontWeight: '600', fontSize: 14 },

    resultsContainer: { flex: 1 },
    resultImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 16 },
    resultTitle: { fontSize: 26, fontWeight: '700', color: theme.text },
    resultSubtitle: { fontSize: 15, color: theme.textSecondary, fontStyle: 'italic', marginBottom: 12 },

    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    badgeText: { fontSize: 12, fontWeight: '700' },

    banner: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16 },
    bannerTitle: { fontWeight: '700', marginBottom: 4, fontSize: 14 },
    bannerBody: { color: theme.textSecondary, fontSize: 14, lineHeight: 20 },

    healthCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16, gap: 10 },
    healthStatus: { fontWeight: '700', fontSize: 16 },
    healthRow: { gap: 2 },
    healthRowLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    healthRowValue: { fontSize: 14, color: theme.text, lineHeight: 20 },

    careSection: { marginBottom: 16 },
    careList: {
      backgroundColor: theme.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    careRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    careLabel: { fontSize: 14, color: theme.textSecondary, fontWeight: '600' },
    careValue: { fontSize: 14, color: theme.text, fontWeight: '600' },
    mutedText: { fontSize: 14, color: theme.textMuted, padding: 14 },

    toxicityBox: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 16, gap: 4 },
    toxicityLabel: { fontWeight: '700', fontSize: 14 },
    toxicityDetail: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },

    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 8 },
    sectionText: { fontSize: 15, color: theme.textSecondary, lineHeight: 22 },

    noPlantBox: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      alignItems: 'center',
      gap: 6,
    },
    noPlantTitle: { fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center' },
    noPlantText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

    footerText: { textAlign: 'center', fontSize: 12, color: theme.textMuted, marginTop: 16 },
  });
}