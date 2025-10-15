package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/JohnBPerkins/chat-service/backend/pkg/nats"
)

// HandleNATSMetrics exposes NATS JetStream metrics
func HandleNATSMetrics(natsConn *nats.NATSConnection) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Get JetStream account info
		info, err := natsConn.JS.AccountInfo(ctx)
		if err != nil {
			http.Error(w, "Failed to get NATS metrics: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Get stream info for CHAT stream
		stream, err := natsConn.JS.Stream(ctx, "CHAT")
		var streamInfo map[string]interface{}
		if err == nil {
			sInfo, _ := stream.Info(ctx)
			streamInfo = map[string]interface{}{
				"name":     sInfo.Config.Name,
				"messages": sInfo.State.Msgs,
				"bytes":    sInfo.State.Bytes,
				"subjects": sInfo.Config.Subjects,
			}
		}

		metrics := map[string]interface{}{
			"jetstream": map[string]interface{}{
				"memory":   info.Memory,
				"storage":  info.Store,
				"streams":  info.Streams,
				"api_calls": map[string]interface{}{
					"total":  info.API.Total,
					"errors": info.API.Errors,
				},
			},
			"chat_stream": streamInfo,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(metrics)
	}
}
