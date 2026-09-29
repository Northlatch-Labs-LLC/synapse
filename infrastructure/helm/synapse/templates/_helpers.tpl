{{/* Synapse chart helpers */}}
{{- define "synapse.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "synapse.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "synapse.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "synapse.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "synapse.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "synapse.selectorLabels" -}}
app.kubernetes.io/name: {{ include "synapse.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
